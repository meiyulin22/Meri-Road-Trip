import { randomUUID } from "node:crypto";

import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";

import { dayPhotos, type FindDayImage } from "@/agents/planner/day-photos";
import { type DriveLegDependencies, planDriveLegs } from "@/agents/transport/legs";
import { applyTransport, planTransport, type TransportDependencies, type TransportPause } from "@/agents/transport/transport-agent";
import { planTransfers, type TransferDependencies } from "@/agents/transport/transfers";
import { maxVerifySearches, type VerifyProgress, type VerifyResult } from "@/agents/planner/verify-spots";
import { checkSpotsOnMap, type MapCheckDependencies, type MapCheckStop } from "@/agents/planner/map-check";
import { addCityWeather, cityCentreLookup } from "@/agents/planner/spot-weather";
import { dressDays } from "@/agents/planner/day-outfits";
import { planStays, type StayDependencies } from "@/agents/planner/plan-stays";
import { draftCityDays } from "@/agents/planner/plan-days";
import { planRoute, type PlanModelDependencies, type PlanUsage, type ReadyScope } from "@/agents/planner/plan-route";
import {
  cityConcurrency,
  type ResearchProgress,
  type ResearchTask,
  researchTasks,
} from "@/agents/planner/research-agent";
import type { PlaceImage } from "@/domain/location/place-image";
import { finishDraft, maxStopsPerDay, type PlanDay, type PlanDraft, planScope, type RoutedPlan } from "@/domain/plan/plan-draft";
import type { ReadyPlan } from "@/domain/plan/plan-draft-response";
import type { PlanHandoff } from "@/domain/plan/plan-handoff";
import { type PlanProgressEvent, type PlanQuestion, planQuestionSchema, type PlanStage } from "@/domain/plan/plan-progress";
import type { PlanRunUsage, PlanVersion } from "@/domain/plan/plan-run";
import type { CityResearch, SpotCard } from "@/domain/plan/spot-card";
import { originPoint, type TransferLeg, transferLegs, travelChoiceOf } from "@/domain/plan/transfer-legs";
import { transportAnswerOf } from "@/domain/plan/transport-question";
import { railCityOfRegion } from "@/platform/rail/rail-names";
import { stopVerdict } from "@/domain/plan/availability";
import { closedStops, type Moved, moveClosedStops, stopChecks, verdictsFor } from "@/domain/plan/plan-repair";
import { maxStopsForPreferences, type PlanPreference } from "@/domain/plan/trip-preference";
import type { GeoPoint } from "@/domain/plan/weather";
import type { WeatherForecast } from "@/platform/weather/weather-forecast";

/** What the workflow needs from outside; tests pass fakes, src/agents/index.ts the real ones. */
export type PlanGenerationDependencies = {
  /** One city's research; the real one is researchCity with Kimi search and model. */
  readonly researchCity: (task: ResearchTask, handoff: PlanHandoff, onProgress: ResearchProgress) => Promise<CityResearch>;
  readonly planModel: PlanModelDependencies;
  readonly map: MapCheckDependencies;
  /** Tianditu drive lookups between neighbouring stops (1.2102); the first failure stops them. */
  readonly drive: DriveLegDependencies;
  /** Tianditu place centres and drives for setting off, changing city and going back (1.2106). */
  readonly transfers: TransferDependencies;
  /** Train searches on 12306 and the transport agent's pick (1.2108). */
  readonly transport: TransportDependencies;
  /** Daily forecasts for points (1.2117); the real one is Open-Meteo, one request a city. */
  readonly weather: WeatherForecast;
  /** Hotel searches (1.2117 stays); absent when HOTEL_PROVIDER is off, and the plan has no stays. */
  readonly hotels?: StayDependencies;
  /** The second round on these cards; the real one is verifySpots with Kimi search and model. */
  readonly verifySpots: (
    cards: readonly SpotCard[],
    options: { readonly month: string; readonly referenceDate: string; readonly locale: "zh" | "en"; readonly budget: number },
    onProgress: VerifyProgress,
  ) => Promise<VerifyResult>;
  readonly findImage: FindDayImage;
  readonly saveVersion: (version: Omit<PlanVersion, "version">) => Promise<PlanVersion>;
  readonly now: () => Date;
};

/** Thrown by a step when the model cannot be reached at all; the run fails with this code. */
export const plannerUnavailable = "planner_unavailable";

/** The step that may pause to ask the traveller, and what it is resumed with. */
export const routeStepId = "plan-route";
export const routeResumeSchema = z.object({
  /** The chosen option's label, or null for "you decide". */
  choice: z.string().nullable(),
  /** The answer saved as a preference; null for "you decide". */
  preference: z.custom<PlanPreference>().nullable(),
  /** The city a written answer says to leave out, checked against the trip (1.2018); older runs have none. */
  leaveOut: z.string().nullable().optional(),
});
export type RouteResume = z.infer<typeof routeResumeSchema>;

/** The step that may pause to ask "train too long, fly instead?" (1.2112); resumed with the same shape. */
export const transferStepId = "transfer-legs";

type MapResult = { cities: CityResearch[]; status: "complete" | "stopped"; lookups: number };
type RouteResult = MapResult & { plan: RoutedPlan; usage: PlanUsage };
/** The legs to, between and back from the cities, carried until the draft can hold them (1.2106). */
type Transfers = { transfers: TransferLeg[]; transferLookups: number };
type TransferResult = RouteResult & Transfers;
type DaysResult = MapResult & Transfers & { draft: PlanDraft; usage: PlanUsage };
/** Where the validation loop stands: how many repair rounds ran, what moved, what it spent. */
type VerifyResultState = DaysResult & {
  verify: { round: number; done: boolean; moved: Moved[]; dropped: { day: number; spotId: string }[]; searches: number; checked: string[] };
};
/** After the drive step: the draft carries its legs, and the lookups count toward the map's. */
type DriveResultState = VerifyResultState & { driveLookups: number };
type PhotosResult = DriveResultState & { dayPhotos: { day: number; image: PlaceImage }[] };

/**
 * Each run's Tianditu stop, shared by its cities (1.2116): the first failed lookup in any city stops
 * the rest of the run's lookups. Kept in memory by run ID; a run resumed after a restart is past it.
 */
const mapStops = new Map<string, MapCheckStop>();
const mapStopOf = (runId: string) => {
  const known = mapStops.get(runId);
  if (known) return known;
  const stop: MapCheckStop = { stopped: false };
  mapStops.set(runId, stop);
  return stop;
};

/** Today in Beijing, which is the day the forecast's reach counts from. */
const beijingDate = (now: Date) => new Date(now.getTime() + 8 * 60 * 60 * 1_000).toISOString().slice(0, 10);

/** Repair rounds after the first check; a conflict still left after them is shown, not hidden. */
export const maxRepairRounds = 2;
/** Unscheduled cards checked per city, so a closed stop has a checked replacement. */
const backupsPerCity = 2;

const runInput = z.object({ runId: z.string(), tripId: z.string(), handoff: z.custom<PlanHandoff>() });
const runState = z.object({
  runId: z.string(),
  tripId: z.string(),
  handoff: z.custom<PlanHandoff>(),
  scope: z.custom<ReadyScope>().nullable(),
  deferred: z.custom<CityResearch[]>(),
  pendingProvinces: z.array(z.string()),
});
type RunState = z.infer<typeof runState>;

/** Each step is one stage on the plan page. */
export const stepStages = {
  "load-scope": "scope",
  "research-city": "research",
  "map-check": "map",
  "plan-route": "route",
  "transfer-legs": "transfers",
  "plan-days": "days",
  "verify-facts": "verify",
  "verify-repair": "verify",
  "drive-legs": "drive",
  "day-outfits": "outfit",
  "plan-stays": "stays",
  "day-photos": "photos",
  "save-plan": "save",
} as const satisfies Record<string, PlanStage>;

type Writer = { write(data: unknown): Promise<void> };

/**
 * Progress callbacks are synchronous and may fire from parallel searches; the writer must
 * be awaited, one write at a time. `flush` waits for every write sent so far.
 */
function emitter(writer: Writer) {
  let chain = Promise.resolve();
  return {
    emit(event: PlanProgressEvent) {
      chain = chain.then(() => writer.write(event));
    },
    flush: () => chain,
  };
}

function scopeOf(state: RunState): ReadyScope {
  if (!state.scope) throw new Error("The plan scope was not loaded.");
  return state.scope;
}

function addUsage(total: PlanUsage, call: PlanUsage): PlanUsage {
  return { inputTokens: total.inputTokens + call.inputTokens, outputTokens: total.outputTokens + call.outputTokens };
}

/**
 * The numbers on a stage's collapsed ✓ line, from the step's own output, or null for a
 * step that is not a stage.
 */
export function stageSummary(stepId: string, output: unknown): { stage: PlanStage; summary: Record<string, number> } | null {
  if (!(stepId in stepStages)) return null;
  const stage = stepStages[stepId as keyof typeof stepStages];
  switch (stage) {
    case "scope":
      return { stage, summary: { cities: (output as ResearchTask[]).length } };
    case "research": {
      const cities = output as CityResearch[];
      const cards = cities.flatMap(({ spots }) => spots);
      return { stage, summary: {
        cities: cities.length, cards: cards.length,
        sourced: cards.filter(({ location }) => location !== null).length,
        searches: cities.reduce((sum, { searchCalls }) => sum + searchCalls, 0),
      } };
    }
    case "map": {
      const { cities, lookups } = output as MapResult;
      const checks = cities.flatMap(({ spots }) => spots.map(({ mapCheck }) => mapCheck.status));
      return { stage, summary: {
        located: checks.filter((status) => status === "located").length,
        checked: checks.filter((status) => status !== "unchecked").length,
        lookups,
      } };
    }
    case "route": {
      const { plan } = output as RouteResult;
      return { stage, summary: { cities: plan.route.cities.length, days: plan.frames.length } };
    }
    case "transfers": {
      const { transfers, transferLookups } = output as TransferResult;
      return { stage, summary: {
        legs: transfers.length,
        estimated: transfers.filter(({ estimate }) => estimate.status === "estimated").length,
        lookups: transferLookups,
      } };
    }
    case "days": {
      const { draft } = output as DaysResult;
      return { stage, summary: {
        days: draft.days.length, stops: draft.days.reduce((sum, { stops }) => sum + stops.length, 0),
        conflicts: draft.conflicts.length,
      } };
    }
    case "verify": {
      // The stage ends with the loop: one ✓ line for the check and every repair round.
      const { draft, verify } = output as VerifyResultState;
      if (stepId !== "verify-repair" || !verify.done) return null;
      const checks = draft.checks ?? [];
      return { stage, summary: {
        checked: checks.filter(({ status }) => status !== "unchecked").length,
        stops: checks.length,
        reservations: checks.filter(({ reservation }) => reservation !== null).length,
        moved: verify.moved.length,
        closed: draft.conflicts.filter(({ kind }) => kind === "closed_on_day").length,
        rounds: verify.round,
      } };
    }
    case "drive": {
      const { draft, driveLookups } = output as DriveResultState;
      return { stage, summary: { legs: draft.legs?.length ?? 0, lookups: driveLookups } };
    }
    case "outfit": {
      const outfits = (output as DriveResultState).draft.outfits ?? [];
      return { stage, summary: { days: outfits.length, extras: outfits.reduce((sum, { extras }) => sum + extras.length, 0) } };
    }
    case "stays": {
      const stays = (output as DriveResultState).draft.stays ?? [];
      return { stage, summary: {
        cities: stays.length, found: stays.filter(({ status }) => status === "found").length,
        picks: stays.filter((stay) => stay.status === "found" && stay.recommended !== null).length,
      } };
    }
    case "photos":
      return { stage, summary: { photos: (output as PhotosResult).dayPhotos.length } };
    case "save":
      return { stage, summary: { version: (output as { version: number }).version } };
  }
}

/**
 * Generate plan as a Mastra workflow: read the trip's scope, research every city two at
 * a time, check the spots on Tianditu, route the trip, choose each city's days, add a
 * photo to each day, and save the plan as a new version. The steps only call the planner
 * functions in src/agents/planner and report what they do; every rule lives there.
 */
export function createPlanGenerationWorkflow(deps: PlanGenerationDependencies) {
  const loadScope = createStep({
    id: "load-scope",
    inputSchema: runInput,
    outputSchema: z.custom<ResearchTask[]>(),
    stateSchema: runState,
    execute: async ({ inputData, setState, writer }) => {
      const { runId, tripId, handoff } = inputData;
      const scope = planScope(handoff.tripState);
      // The API answers a trip without a city before starting a run.
      if (scope.status !== "ready") throw new Error("The trip has no city to plan.");
      const { tasks, deferred, pendingProvinces } = researchTasks(handoff);
      await setState({ runId, tripId, handoff, scope, deferred, pendingProvinces });
      await writer.write({
        type: "scope.ready", mode: scope.mode, totalDays: scope.totalDays,
        cities: tasks.map(({ province, city }) => ({ province, city })),
        deferred: deferred.map(({ city }) => city), pendingProvinces,
      } satisfies PlanProgressEvent);
      return tasks;
    },
  });

  /**
   * City centres and the origin's point for the route's detour guard (1.2117), from the cache the
   * transfers fill or one Tianditu search each; none once the map check stopped at a failure.
   */
  async function routeGeography(cities: readonly string[], handoff: PlanHandoff, mapStopped: boolean) {
    const centreOf = cityCentreLookup(deps.transfers, { stopped: mapStopped });
    const points = new Map<string, GeoPoint>();
    for (const city of cities) {
      const point = await centreOf(city);
      if (point) points.set(city, point);
    }
    const origin = handoff.tripState.origin;
    const originAt = originPoint(origin) ?? (origin.state === "known" ? await centreOf(origin.value) : null);
    return { points, origin: originAt };
  }

  const researchCityStep = createStep({
    id: "research-city",
    inputSchema: z.custom<ResearchTask>(),
    outputSchema: z.custom<CityResearch>(),
    stateSchema: runState,
    execute: async ({ inputData, state, writer }) => {
      const { emit, flush } = emitter(writer);
      const startedAt = performance.now();
      const researched = await deps.researchCity(inputData, state.handoff,
        (activity) => emit({ type: "stage.activity", stage: "research", activity }));
      // The city's spots go on the map as soon as its research is done (1.2116), with the run's one
      // Tianditu stop: the city that finishes first no longer waits for the other.
      const located = await checkSpotsOnMap([researched], deps.map,
        ({ city: name, spot, done, total }) => emit({ type: "stage.activity", stage: "research", activity: { kind: "locating", city: name, spot, done, total } }),
        mapStopOf(state.runId));
      // Then the weather at its spots on the trip's dates (1.2117), a fixed code step, one request a city.
      const weathered = await addCityWeather(located.cities[0], scopeOf(state).dates, beijingDate(deps.now()), {
        forecast: deps.weather,
        cityCentre: cityCentreLookup(deps.transfers, mapStopOf(state.runId)),
      }, ({ city: name, points }) => emit({ type: "stage.activity", stage: "research", activity: { kind: "forecasting", city: name, points } }));
      const city: CityResearch = { ...weathered.city, mapLookups: located.lookups, weatherCalls: weathered.calls };
      emit({
        type: "city.researched", province: city.province, city: city.city, status: city.status,
        cards: city.spots.length, sourced: city.spots.filter(({ location }) => location !== null).length,
        searches: city.searchCalls, ms: Math.round(performance.now() - startedAt),
      });
      await flush();
      return city;
    },
  });

  const mapCheck = createStep({
    id: "map-check",
    inputSchema: z.custom<CityResearch[]>(),
    outputSchema: z.custom<MapResult>(),
    stateSchema: runState,
    execute: async ({ inputData, state, writer }) => {
      const { emit, flush } = emitter(writer);
      // Each city was checked inside its research (1.2116); this step adds the deferred cities, which
      // keep their named spots unlooked-up, and reports the run's map check as one line.
      const stop = mapStopOf(state.runId);
      mapStops.delete(state.runId);
      const outcome: MapResult = {
        cities: [...inputData, ...state.deferred],
        status: stop.stopped ? "stopped" : "complete",
        lookups: inputData.reduce((sum, { mapLookups }) => sum + (mapLookups ?? 0), 0),
      };
      const checks = outcome.cities.flatMap(({ spots }) => spots.map(({ mapCheck: check }) => check.status));
      emit({
        type: "map.checked", status: outcome.status, lookups: outcome.lookups,
        located: checks.filter((status) => status === "located").length,
        notLocated: checks.filter((status) => status === "not_located").length,
      });
      await flush();
      return outcome;
    },
  });

  const routeStep = createStep({
    id: routeStepId,
    inputSchema: z.custom<MapResult>(),
    outputSchema: z.custom<RouteResult>(),
    stateSchema: runState,
    suspendSchema: z.object({ question: planQuestionSchema, usage: z.custom<PlanUsage>() }),
    resumeSchema: routeResumeSchema,
    execute: async ({ inputData, state, setState, writer, suspend, suspendData, resumeData }) => {
      const { emit, flush } = emitter(writer);
      const scope = scopeOf(state);
      let handoff = state.handoff;
      let usage: PlanUsage = { inputTokens: 0, outputTokens: 0 };
      if (resumeData && suspendData) {
        // The answer is one more preference for the rest of the run and the saved version.
        if (resumeData.preference) {
          handoff = { ...handoff, preferences: [...handoff.preferences, resumeData.preference] };
          await setState({ ...state, handoff });
        }
        usage = suspendData.usage;
        emit({ type: "question.answered", questionId: suspendData.question.id, choice: resumeData.choice });
      }
      // Asked at most once a run, and only where cities compete for the days.
      const allowQuestion = !resumeData && scope.mode === "full" && scope.cities.length > 1;
      const geography = scope.mode === "full" && scope.cities.length > 1
        ? await routeGeography(scope.cities.map(({ city }) => city), handoff, inputData.status === "stopped")
        : undefined;
      const result = await planRoute(handoff, scope, inputData.cities, deps.planModel,
        ({ attempt }) => emit({ type: "stage.activity", stage: "route",
          activity: { kind: "routing", cities: scope.cities.length, days: scope.dates.length, attempt } }),
        {
          allowQuestion,
          geography,
          // The city the traveller chose to leave out when asked, if the answer was that.
          leaveOut: resumeData && suspendData
            ? [
              ...suspendData.question.options.filter(({ label, leaveOut }) => label === resumeData.choice && leaveOut)
                .map(({ leaveOut }) => leaveOut as string),
              ...(resumeData.leaveOut ? [resumeData.leaveOut] : []),
            ]
            : [],
        });
      if (result.status === "unavailable") throw new Error(plannerUnavailable);
      if (result.status === "question") {
        const question: PlanQuestion = { id: randomUUID(), ...result.question };
        emit({ type: "run.waiting", question });
        await flush();
        return suspend({ question, usage: addUsage(usage, result.usage) });
      }
      emit({ type: "route.ready", route: result.plan.route });
      await flush();
      return { ...inputData, plan: result.plan, usage: addUsage(usage, result.usage) };
    },
  });

  /**
   * The legs to, between and back from the cities, once the route says their order (1.2106):
   * code lists them, then a rough drive between city centres is looked up for each. It runs
   * before the days are drafted, where the transport agent will sit; for now the days still
   * assume a transfer takes the morning.
   */
  const transferStep = createStep({
    id: transferStepId,
    inputSchema: z.custom<RouteResult>(),
    outputSchema: z.custom<TransferResult>(),
    stateSchema: runState,
    // Everything found before asking is kept, so the answer decides the legs without new searches.
    suspendSchema: z.object({
      question: planQuestionSchema,
      usage: z.custom<PlanUsage>(),
      pause: z.custom<{ legs: TransferLeg[]; transferLookups: number; findings: TransportPause["findings"]; askedLegs: number[] }>(),
    }),
    resumeSchema: routeResumeSchema,
    execute: async ({ inputData, state, setState, writer, suspend, suspendData, resumeData }) => {
      const { emit, flush } = emitter(writer);
      if (resumeData && suspendData) {
        // The answer is one more preference for the rest of the run and the saved version.
        if (resumeData.preference) await setState({ ...state, handoff: { ...state.handoff, preferences: [...state.handoff.preferences, resumeData.preference] } });
        emit({ type: "question.answered", questionId: suspendData.question.id, choice: resumeData.choice });
        const { pause } = suspendData;
        const transfers = applyTransport(pause.legs, pause.findings, state.handoff.locale,
          { legs: pause.askedLegs, choice: transportAnswerOf(resumeData.choice) });
        await flush();
        return {
          ...inputData, transfers, transferLookups: pause.transferLookups,
          usage: addUsage(inputData.usage, suspendData.usage),
        };
      }
      const scope = scopeOf(state);
      const legs = transferLegs(inputData.plan.frames, state.handoff.tripState.origin, scope.mode);
      const origin = state.handoff.tripState.origin;
      const outcome = await planTransfers(legs, deps.transfers,
        ({ from, to, done, total }) => emit({ type: "stage.activity", stage: "transfers", activity: { kind: "driving", from, to, done, total } }),
        // An origin picked from the map's suggestions in the Workspace keeps its own point.
        originPoint(origin));
      // Trains only when the trip says how it travels; with no preference the drive estimate stands.
      const choice = travelChoiceOf(state.handoff.tripState.transportPreference);
      const transport = choice === null ? null : await planTransport(outcome.legs, {
        choice,
        dates: new Map(inputData.plan.frames.map(({ day, date }) => [day, date])),
        originRailCity: origin.state === "known" && origin.selection?.region ? railCityOfRegion(origin.selection.region, origin.value) : null,
        preferences: state.handoff.preferences.map(({ quote }) => quote),
        locale: state.handoff.locale,
        allowQuestion: true,
      }, deps.transport, ({ mode, from, to, done, total }) =>
        emit({ type: "stage.activity", stage: "transfers", activity: { kind: mode === "flight" ? "flights" : "trains", from, to, done, total } }));
      if (transport?.question) {
        const question: PlanQuestion = { id: randomUUID(), ...transport.question.question };
        emit({ type: "run.waiting", question });
        await flush();
        return suspend({
          question, usage: transport.usage,
          pause: {
            legs: [...transport.question.legs], transferLookups: outcome.lookups,
            findings: transport.question.findings, askedLegs: [...transport.question.askedLegs],
          },
        });
      }
      await flush();
      return {
        ...inputData,
        transfers: transport?.legs ?? outcome.legs,
        transferLookups: outcome.lookups,
        usage: transport ? addUsage(inputData.usage, transport.usage) : inputData.usage,
      };
    },
  });

  const daysStep = createStep({
    id: "plan-days",
    inputSchema: z.custom<TransferResult>(),
    outputSchema: z.custom<DaysResult>(),
    stateSchema: runState,
    execute: async ({ inputData, state, writer }) => {
      const { emit, flush } = emitter(writer);
      const scope = scopeOf(state);
      const { plan } = inputData;
      let usage = inputData.usage;
      const days: PlanDay[] = [];
      // City by city in route order, so each city's days reach the page as they are drafted.
      for (const routed of plan.route.cities) {
        const frames = plan.frames.filter((frame) => frame.province === routed.province && frame.city === routed.city);
        const cards = inputData.cities.find(({ province, city }) => province === routed.province && city === routed.city)?.spots ?? [];
        const result = await draftCityDays(state.handoff, scope.mode, frames, cards, deps.planModel,
          ({ attempt }) => emit({ type: "stage.activity", stage: "days",
            activity: { kind: "drafting", city: routed.city, days: frames.map(({ day }) => day), attempt } }));
        if (result.status === "unavailable") throw new Error(plannerUnavailable);
        usage = addUsage(usage, result.usage);
        for (const day of result.days) {
          const used = new Set(day.stops.map(({ spotId }) => spotId));
          emit({ type: "day.ready", day, spots: cards.filter(({ id }) => used.has(id)) });
          days.push(day);
        }
      }
      const routedCards = inputData.cities
        .filter(({ province, city }) => plan.route.cities.some((routed) => routed.province === province && routed.city === city))
        .flatMap(({ spots }) => spots);
      const allocation = { mode: scope.mode, totalDays: scope.totalDays, frames: plan.frames, route: plan.route };
      const draft = finishDraft(allocation, routedCards, [...days].sort((left, right) => left.day - right.day));
      await flush();
      return {
        cities: inputData.cities, status: inputData.status, lookups: inputData.lookups, draft, usage,
        transfers: inputData.transfers, transferLookups: inputData.transferLookups,
      };
    },
  });

  /** Every card by ID, with the second round's facts once they are in. */
  const cardsOf = (cities: readonly CityResearch[]) => new Map(cities.flatMap(({ spots }) => spots).map((card) => [card.id, card]));
  const withFacts = (cities: readonly CityResearch[], facts: VerifyResult["availability"]) => cities.map((city) => ({
    ...city, spots: city.spots.map((card) => facts.has(card.id) ? { ...card, availability: facts.get(card.id) } : card),
  }));
  const monthOf = (draft: PlanDraft) => {
    const date = draft.days.find(({ date: value }) => value !== null)?.date;
    return date ? `${Number(date.slice(0, 4))}年${Number(date.slice(5, 7))}月` : "";
  };

  /**
   * The validation stage, part one: collect the facts. Every scheduled stop is checked, then
   * a few unscheduled cards per city as replacements, within the search budget. Code turns
   * the facts into a verdict for each stop on its own date.
   */
  const verifyFactsStep = createStep({
    id: "verify-facts",
    inputSchema: z.custom<DaysResult>(),
    outputSchema: z.custom<VerifyResultState>(),
    stateSchema: runState,
    execute: async ({ inputData, state, writer }) => {
      const { emit, flush } = emitter(writer);
      const { draft } = inputData;
      const cards = cardsOf(inputData.cities);
      const scheduled = [...new Set(draft.days.flatMap(({ stops }) => stops.map(({ spotId }) => spotId)))];
      const routed = draft.route.cities.map(({ city }) => city);
      const backups = routed.flatMap((city) => [...cards.values()]
        .filter((card) => card.city === city && !scheduled.includes(card.id) && card.location !== null)
        .sort((left, right) => Number(right.mapCheck.status === "located") - Number(left.mapCheck.status === "located"))
        .slice(0, backupsPerCity));
      const targets = [...scheduled.flatMap((id) => cards.get(id) ?? []), ...backups];
      const result = await deps.verifySpots(targets, {
        month: monthOf(draft), referenceDate: state.handoff.referenceDate, locale: state.handoff.locale, budget: maxVerifySearches,
      }, ({ city, spot, done, total }) => emit({ type: "stage.activity", stage: "verify",
        activity: { kind: "verifying", city, spot, done, total } }));
      const cities = withFacts(inputData.cities, result.availability);
      const checkedCards = cardsOf(cities);
      const verdicts = verdictsFor(draft.days, checkedCards, state.handoff.referenceDate);
      for (const check of stopChecks(draft.days, checkedCards, verdicts, [])) emit({ type: "spot.checked", check });
      await flush();
      return {
        ...inputData,
        cities,
        usage: addUsage(inputData.usage, result.usage),
        verify: {
          round: 0, done: closedStops(draft.days, verdicts).length === 0, moved: [], dropped: [], searches: result.searches,
          checked: [...result.availability.keys()],
        },
      };
    },
  });

  /**
   * The validation stage, part two, run in a loop until nothing is closed or the rounds run
   * out: code moves what it can, the Plan Agent re-plans only the days still affected, the
   * new stops are checked, and the verdicts are taken again. Then the stops still closed
   * become conflicts and every stop keeps its verdict.
   */
  const verifyRepairStep = createStep({
    id: "verify-repair",
    inputSchema: z.custom<VerifyResultState>(),
    outputSchema: z.custom<VerifyResultState>(),
    stateSchema: runState,
    execute: async ({ inputData, state, writer }) => {
      const { emit, flush } = emitter(writer);
      const scope = scopeOf(state);
      const referenceDate = state.handoff.referenceDate;
      const maxStops = maxStopsForPreferences(state.handoff.preferences, maxStopsPerDay);
      let { cities, usage } = inputData;
      let days = [...inputData.draft.days];
      let { round, searches, moved, checked, dropped } = inputData.verify;

      if (!inputData.verify.done) {
        round += 1;
        const before = new Map(days.map((day) => [day.day, JSON.stringify(day)]));
        const issues = closedStops(days, verdictsFor(days, cardsOf(cities), referenceDate));
        emit({ type: "stage.activity", stage: "verify",
          activity: { kind: "repairing", days: [...new Set(issues.map(({ day }) => day))], round } });

        // Code first: a later slot, or another day in the same city.
        const step = moveClosedStops(days, cardsOf(cities), referenceDate, maxStops);
        days = step.days;
        moved = [...moved, ...step.moved];

        // Then the Plan Agent, only for the days still holding a closed stop.
        const stuckDays = [...new Set(step.stuck.map(({ day }) => day))];
        for (const city of [...new Set(days.filter(({ day }) => stuckDays.includes(day)).map(({ city: name }) => name))]) {
          const affected = days.filter((day) => day.city === city && stuckDays.includes(day.day));
          const elsewhere = new Set(days.filter((day) => !affected.includes(day)).flatMap(({ stops }) => stops.map(({ spotId }) => spotId)));
          const closedThere = new Set(step.stuck.map(({ spotId }) => spotId));
          dropped = [...dropped, ...step.stuck.filter(({ day }) => affected.some(({ day: number }) => number === day))];
          const candidates = [...cardsOf(cities).values()].filter((card) => card.city === city
            && !elsewhere.has(card.id) && !closedThere.has(card.id)
            && affected.every((day) => stopVerdict(card.availability, day.date, "afternoon", referenceDate).status !== "closed"));
          const frames = affected.map((day) => ({ ...day, stops: [] }));
          const result = await draftCityDays(state.handoff, scope.mode, frames, candidates, deps.planModel);
          const replanned = result.status === "ready"
            ? result.days
            : affected.map((day) => ({ ...day, stops: day.stops.filter(({ spotId }) => !closedThere.has(spotId)) }));
          if (result.status === "ready") usage = addUsage(usage, result.usage);
          days = days.map((day) => replanned.find(({ day: number }) => number === day.day) ?? day);
        }

        // New stops get their facts too, while the search budget lasts.
        const unchecked = [...new Set(days.flatMap(({ stops }) => stops.map(({ spotId }) => spotId)))]
          .filter((id) => !checked.includes(id)).flatMap((id) => cardsOf(cities).get(id) ?? []);
        if (unchecked.length > 0 && searches < maxVerifySearches) {
          const result = await deps.verifySpots(unchecked, {
            month: monthOf(inputData.draft), referenceDate, locale: state.handoff.locale, budget: maxVerifySearches - searches,
          }, ({ city, spot, done, total }) => emit({ type: "stage.activity", stage: "verify",
            activity: { kind: "verifying", city, spot, done, total } }));
          cities = withFacts(cities, result.availability);
          searches += result.searches;
          checked = [...checked, ...result.availability.keys()];
          usage = addUsage(usage, result.usage);
        }

        const cards = cardsOf(cities);
        for (const day of days) {
          if (before.get(day.day) === JSON.stringify(day)) continue;
          const used = new Set(day.stops.map(({ spotId }) => spotId));
          emit({ type: "day.ready", day, spots: [...cards.values()].filter(({ id }) => used.has(id)) });
        }
      }

      const cards = cardsOf(cities);
      let verdicts = verdictsFor(days, cards, referenceDate);
      const done = closedStops(days, verdicts).length === 0 || round >= maxRepairRounds;
      let draft: PlanDraft = { ...inputData.draft, days };
      if (done) {
        // What is still closed cannot happen: it leaves the day and is shown as a conflict, as is a
        // stop dropped for being closed that no other day took.
        const scheduledNow = new Set(days.flatMap(({ stops }) => stops.map(({ spotId }) => spotId)));
        const stillClosed = [
          ...closedStops(days, verdicts),
          ...dropped.filter(({ spotId }) => !scheduledNow.has(spotId))
            .filter((item, index, all) => all.findIndex(({ spotId }) => spotId === item.spotId) === index),
        ];
        const finalDays = days.map((day) => ({
          ...day, stops: day.stops.filter(({ spotId }) => !stillClosed.some((item) => item.day === day.day && item.spotId === spotId)),
        }));
        verdicts = verdictsFor(finalDays, cards, referenceDate);
        const routedCards = [...cards.values()].filter(({ city }) => draft.route.cities.some((routed) => routed.city === city));
        const frames = finalDays.map(({ day, date, province, city, arrivingFrom, focus, theme }) =>
          ({ day, date, province, city, arrivingFrom, focus, theme }));
        const finished = finishDraft({ mode: draft.mode, totalDays: draft.totalDays, frames, route: draft.route }, routedCards, finalDays);
        const closedConflicts = stillClosed.map(({ day, spotId }) => ({ kind: "closed_on_day" as const, day, spotId }));
        draft = {
          ...finished,
          conflicts: [
            ...finished.conflicts.filter((conflict) => !("spotId" in conflict && stillClosed.some(({ spotId }) => spotId === conflict.spotId))),
            ...closedConflicts,
          ],
          checks: stopChecks(finalDays, cards, verdicts, moved),
        };
        if (stillClosed.length > 0) {
          for (const day of finalDays.filter(({ day: number }) => stillClosed.some((item) => item.day === number))) {
            const used = new Set(day.stops.map(({ spotId }) => spotId));
            emit({ type: "day.ready", day, spots: [...cards.values()].filter(({ id }) => used.has(id)) });
          }
        }
        for (const check of draft.checks ?? []) emit({ type: "spot.checked", check });
      }
      await flush();
      return { ...inputData, cities, usage, draft, verify: { round, done, moved, dropped, searches, checked } };
    },
  });

  /**
   * Driving between neighbouring stops, once the days are final (1.2102): the road for the
   * map and the time for the day cards. A failed lookup leaves the rest as straight lines.
   */
  const driveStep = createStep({
    id: "drive-legs",
    inputSchema: z.custom<VerifyResultState>(),
    outputSchema: z.custom<DriveResultState>(),
    execute: async ({ inputData, writer }) => {
      const { emit, flush } = emitter(writer);
      const outcome = await planDriveLegs(inputData.draft.days, cardsOf(inputData.cities), deps.drive,
        ({ from, to, done, total }) => emit({ type: "stage.activity", stage: "drive", activity: { kind: "driving", from, to, done, total } }));
      await flush();
      return {
        ...inputData,
        draft: { ...inputData.draft, legs: outcome.legs, transfers: inputData.transfers },
        driveLookups: outcome.lookups,
      };
    },
  });

  /**
   * What to wear each day with a forecast (1.2117 outfit), once the days are final: code's basics
   * from the weather, then one Kimi call for additions; the plan never waits on it failing.
   */
  const outfitsStep = createStep({
    id: "day-outfits",
    inputSchema: z.custom<DriveResultState>(),
    outputSchema: z.custom<DriveResultState>(),
    stateSchema: runState,
    execute: async ({ inputData, state, writer }) => {
      const { emit, flush } = emitter(writer);
      const result = await dressDays(state.handoff, inputData.draft.days, cardsOf(inputData.cities), deps.planModel);
      for (const outfit of result.outfits) emit({ type: "day.outfit", outfit });
      await flush();
      return {
        ...inputData,
        draft: result.outfits.length > 0 ? { ...inputData.draft, outfits: [...result.outfits] } : inputData.draft,
        usage: addUsage(inputData.usage, result.usage),
      };
    },
  });

  /**
   * Where to stay (1.2117 stays): one hotel search a city stay, three tiers by code, the Plan
   * Agent's pick when preferences bear on lodging. Skipped when hotel search is off.
   */
  const staysStep = createStep({
    id: "plan-stays",
    inputSchema: z.custom<DriveResultState>(),
    outputSchema: z.custom<DriveResultState>(),
    stateSchema: runState,
    execute: async ({ inputData, state, writer }) => {
      if (!deps.hotels) return inputData;
      const { emit, flush } = emitter(writer);
      const result = await planStays(state.handoff, inputData.draft.days, cardsOf(inputData.cities), deps.hotels, deps.planModel, deps.now,
        ({ city, near, done, total }) => emit({ type: "stage.activity", stage: "stays", activity: { kind: "hotels", city, near, done, total } }));
      for (const stay of result.stays) emit({ type: "stay.ready", stay });
      await flush();
      return {
        ...inputData,
        draft: result.stays.length > 0 ? { ...inputData.draft, stays: result.stays } : inputData.draft,
        usage: addUsage(inputData.usage, result.usage),
      };
    },
  });

  const photosStep = createStep({
    id: "day-photos",
    inputSchema: z.custom<DriveResultState>(),
    outputSchema: z.custom<PhotosResult>(),
    execute: async ({ inputData, writer }) => {
      const { emit, flush } = emitter(writer);
      const names = new Map(inputData.cities.flatMap(({ spots }) => spots).map((card) => [card.id, card.name]));
      const photos = await dayPhotos(inputData.draft.days, (spotId) => names.get(spotId) ?? null, deps.findImage,
        ({ day, image }) => emit({ type: "day.photo", day, image }));
      await flush();
      return { ...inputData, dayPhotos: photos };
    },
  });

  const saveStep = createStep({
    id: "save-plan",
    inputSchema: z.custom<PhotosResult>(),
    outputSchema: z.object({ versionId: z.string(), version: z.number(), usage: z.custom<PlanRunUsage>() }),
    stateSchema: runState,
    execute: async ({ inputData, state }) => {
      const { draft, cities, status, lookups, usage } = inputData;
      const scheduled = new Set(draft.days.flatMap(({ stops }) => stops.map(({ spotId }) => spotId)));
      const conflicted = new Set(draft.conflicts.flatMap((conflict) => "spotId" in conflict ? [conflict.spotId] : []));
      const plan: ReadyPlan = {
        status: "ready",
        draft,
        spots: cities.flatMap(({ spots }) => spots.filter(({ id }) => scheduled.has(id) || conflicted.has(id))),
        cities: cities.map(({ province, city, status: cityStatus }) => ({ province, city, status: cityStatus })),
        pendingProvinces: state.pendingProvinces,
        mapCheck: status,
        dayPhotos: inputData.dayPhotos,
      };
      const saved = await deps.saveVersion({
        id: randomUUID(), tripId: state.tripId, runId: state.runId, tripState: state.handoff.tripState,
        preferences: state.handoff.preferences, plan, createdAt: deps.now().toISOString(),
      });
      return {
        versionId: saved.id,
        version: saved.version,
        usage: {
          // Research ran before the usage total was carried, so its tokens are added here.
          inputTokens: usage.inputTokens + cities.reduce((sum, city) => sum + (city.usage?.inputTokens ?? 0), 0),
          outputTokens: usage.outputTokens + cities.reduce((sum, city) => sum + (city.usage?.outputTokens ?? 0), 0),
          searches: cities.reduce((sum, { searchCalls }) => sum + searchCalls, 0) + inputData.verify.searches,
          mapLookups: lookups + inputData.transferLookups + inputData.driveLookups,
        },
      };
    },
  });

  return createWorkflow({
    id: "plan-generation",
    inputSchema: runInput,
    outputSchema: z.object({ versionId: z.string(), version: z.number(), usage: z.custom<PlanRunUsage>() }),
    stateSchema: runState,
  })
    .then(loadScope)
    .foreach(researchCityStep, { concurrency: cityConcurrency })
    .then(mapCheck)
    .then(routeStep)
    .then(transferStep)
    .then(daysStep)
    .then(verifyFactsStep)
    // The validation loop: repair and re-check until nothing is closed, at most maxRepairRounds rounds.
    .dountil(verifyRepairStep, async ({ inputData }) => inputData.verify.done)
    .then(driveStep)
    .then(outfitsStep)
    .then(staysStep)
    .then(photosStep)
    .then(saveStep)
    .commit();
}

export type PlanGenerationWorkflow = ReturnType<typeof createPlanGenerationWorkflow>;

/** The workflow's first state; load-scope fills in the scope. */
export function initialPlanState(input: { runId: string; tripId: string; handoff: PlanHandoff }): RunState {
  return { ...input, scope: null, deferred: [], pendingProvinces: [] };
}
