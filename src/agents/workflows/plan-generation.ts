import { randomUUID } from "node:crypto";

import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";

import { dayPhotos, type FindDayImage } from "@/agents/planner/day-photos";
import { checkSpotsOnMap, type MapCheckDependencies } from "@/agents/planner/map-check";
import { draftCityDays } from "@/agents/planner/plan-days";
import { planRoute, type PlanModelDependencies, type PlanUsage, type ReadyScope } from "@/agents/planner/plan-route";
import {
  cityConcurrency,
  type ResearchProgress,
  type ResearchTask,
  researchTasks,
} from "@/agents/planner/research-agent";
import type { PlaceImage } from "@/domain/location/place-image";
import { finishDraft, type PlanDay, type PlanDraft, planScope, type RoutedPlan } from "@/domain/plan/plan-draft";
import type { ReadyPlan } from "@/domain/plan/plan-draft-response";
import type { PlanHandoff } from "@/domain/plan/plan-handoff";
import { type PlanProgressEvent, type PlanQuestion, planQuestionSchema, type PlanStage } from "@/domain/plan/plan-progress";
import type { PlanRunUsage, PlanVersion } from "@/domain/plan/plan-run";
import type { CityResearch } from "@/domain/plan/spot-card";
import type { PlanPreference } from "@/domain/plan/trip-preference";

/** What the workflow needs from outside; tests pass fakes, src/agents/index.ts the real ones. */
export type PlanGenerationDependencies = {
  /** One city's research; the real one is researchCity with Kimi search and model. */
  readonly researchCity: (task: ResearchTask, handoff: PlanHandoff, onProgress: ResearchProgress) => Promise<CityResearch>;
  readonly planModel: PlanModelDependencies;
  readonly map: MapCheckDependencies;
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
});
export type RouteResume = z.infer<typeof routeResumeSchema>;

type MapResult = { cities: CityResearch[]; status: "complete" | "stopped"; lookups: number };
type RouteResult = MapResult & { plan: RoutedPlan; usage: PlanUsage };
type DaysResult = MapResult & { draft: PlanDraft; usage: PlanUsage };
type PhotosResult = DaysResult & { dayPhotos: { day: number; image: PlaceImage }[] };

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
  "plan-days": "days",
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
    case "days": {
      const { draft } = output as DaysResult;
      return { stage, summary: {
        days: draft.days.length, stops: draft.days.reduce((sum, { stops }) => sum + stops.length, 0),
        conflicts: draft.conflicts.length,
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

  const researchCityStep = createStep({
    id: "research-city",
    inputSchema: z.custom<ResearchTask>(),
    outputSchema: z.custom<CityResearch>(),
    stateSchema: runState,
    execute: async ({ inputData, state, writer }) => {
      const { emit, flush } = emitter(writer);
      const startedAt = performance.now();
      const city = await deps.researchCity(inputData, state.handoff,
        (activity) => emit({ type: "stage.activity", stage: "research", activity }));
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
      // Deferred cities keep their named spots but are not looked up.
      const outcome = await checkSpotsOnMap([...inputData, ...state.deferred], deps.map,
        ({ city, spot, done, total }) => emit({ type: "stage.activity", stage: "map", activity: { kind: "locating", city, spot, done, total } }));
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
      const result = await planRoute(handoff, scope, inputData.cities, deps.planModel,
        ({ attempt }) => emit({ type: "stage.activity", stage: "route",
          activity: { kind: "routing", cities: scope.cities.length, days: scope.dates.length, attempt } }),
        { allowQuestion });
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

  const daysStep = createStep({
    id: "plan-days",
    inputSchema: z.custom<RouteResult>(),
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
      return { cities: inputData.cities, status: inputData.status, lookups: inputData.lookups, draft, usage };
    },
  });

  const photosStep = createStep({
    id: "day-photos",
    inputSchema: z.custom<DaysResult>(),
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
          ...usage,
          searches: cities.reduce((sum, { searchCalls }) => sum + searchCalls, 0),
          mapLookups: lookups,
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
    .then(daysStep)
    .then(photosStep)
    .then(saveStep)
    .commit();
}

export type PlanGenerationWorkflow = ReturnType<typeof createPlanGenerationWorkflow>;

/** The workflow's first state; load-scope fills in the scope. */
export function initialPlanState(input: { runId: string; tripId: string; handoff: PlanHandoff }): RunState {
  return { ...input, scope: null, deferred: [], pendingProvinces: [] };
}
