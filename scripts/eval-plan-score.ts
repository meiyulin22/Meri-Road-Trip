import { z } from "zod";

import { weekdayOf } from "@/domain/plan/availability";
import { splitRequested } from "@/domain/plan/plan-draft";
import type { ReadyPlan } from "@/domain/plan/plan-draft-response";
import type { PlanHandoff } from "@/domain/plan/plan-handoff";
import type { PlanProgressEvent } from "@/domain/plan/plan-progress";
import type { PlanRun } from "@/domain/plan/plan-run";
import { preferenceKinds } from "@/domain/plan/trip-preference";
import { locales } from "@/domain/locale/locale";
import type { SpotCard } from "@/domain/plan/spot-card";

/**
 * One evaluation case in evals/plan/cases: a trip written short, how to answer a question,
 * and what the plan must show. The runner builds the PlanHandoff from it, so a case reads
 * like the trip it stands for.
 */
export const evalCaseSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]+$/u),
  title: z.string().min(1),
  /** What the case is there to catch, for the reader of a report. */
  covers: z.string().min(1),
  areas: z.array(z.strictObject({
    province: z.string().min(1),
    cities: z.array(z.strictObject({ city: z.string().min(1), spots: z.array(z.string().min(1)).default([]) })).min(1),
  })).min(1),
  days: z.number().int().positive().nullable(),
  startDate: z.iso.date().nullable(),
  locale: z.enum(locales).default("zh"),
  preferences: z.array(z.strictObject({ kind: z.enum(preferenceKinds), label: z.string().min(1).max(24), quote: z.string().min(1) })).default([]),
  /** Which option answers a question: its index, or "decide" for "you decide". */
  answer: z.union([z.number().int().nonnegative(), z.literal("decide")]).default(0),
  /** Runs of this case in one evaluation; the model's answers vary. */
  repeat: z.number().int().positive().default(1),
  expect: z.strictObject({
    mode: z.enum(["preview", "full"]).optional(),
    /** Every selected city is routed and none is left out. */
    keepsAllCities: z.boolean().optional(),
    asks: z.boolean().optional(),
    /** Each question option that leaves a city out names one (1.2012). */
    leaveOutOptions: z.boolean().optional(),
    scheduled: z.array(z.string().min(1)).optional(),
    notScheduled: z.array(z.string().min(1)).optional(),
    reservationFound: z.array(z.string().min(1)).optional(),
    notOnWeekdays: z.array(z.strictObject({ spot: z.string().min(1), weekdays: z.array(z.number().int().min(1).max(7)).min(1) })).optional(),
    maxStopsPerDay: z.number().int().positive().optional(),
    noEmptyDays: z.boolean().optional(),
    /** The route reasons and day themes are written in English. */
    englishText: z.boolean().optional(),
  }),
});
export type EvalCase = z.output<typeof evalCaseSchema>;

/** What the runner collected from one run: its events in order, the run record and the saved plan. */
export type RunCapture = {
  readonly events: readonly PlanProgressEvent[];
  readonly run: Pick<PlanRun, "status" | "errorCode" | "usage" | "durationMs"> | null;
  readonly plan: ReadyPlan | null;
};

const known = (value: string) => ({ state: "known" as const, value, source: "user" as const });
const missing = { state: "missing" as const };
const dayMs = 24 * 60 * 60 * 1000;

/** The handoff the plan page would send for this case, dated from the run's reference date. */
export function buildHandoff(evalCase: EvalCase, referenceDate: string): PlanHandoff {
  const { days, startDate } = evalCase;
  const endDate = days !== null && startDate !== null
    ? new Date(Date.parse(startDate + "T00:00:00Z") + (days - 1) * dayMs).toISOString().slice(0, 10)
    : null;
  return {
    tripState: {
      name: missing,
      origin: missing,
      destination: {
        state: "known",
        source: "user",
        areas: evalCase.areas.map(({ province, cities }) => ({
          province,
          places: cities.map(({ city, spots }) => ({ name: city, spots })),
        })),
      },
      startDate: startDate ? known(startDate) : missing,
      endDate: endDate ? known(endDate) : missing,
      duration: days !== null ? known(`${days}天`) : missing,
      transportPreference: missing,
    },
    referenceDate,
    timezone: "Asia/Shanghai",
    locale: evalCase.locale,
    preferenceStatus: "ready",
    preferences: evalCase.preferences.map(({ kind, label, quote }, index) => ({
      id: `eval-${index + 1}`, label, kind, quote, source: "conversation", messageId: `eval-message-${index + 1}`,
      createdAt: referenceDate + "T00:00:00.000Z",
    })),
  };
}

/** The numbers one run is compared by. Every count comes from the events and the saved plan. */
export type RunMetrics = {
  readonly status: string;
  readonly errorCode: string | null;
  readonly durationMs: number | null;
  readonly stageMs: Readonly<Record<string, number>>;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly searches: { readonly research: number; readonly verify: number };
  readonly mapLookups: number | null;
  readonly mapStopped: boolean;
  readonly routeAttempts: number;
  /** Day-planning calls that needed their second attempt. */
  readonly dayRetries: number;
  readonly routeSource: "agent" | "fallback" | null;
  readonly asked: boolean;
  readonly cities: { readonly selected: number; readonly routed: number; readonly omitted: number };
  readonly cards: { readonly total: number; readonly sourced: number };
  readonly requested: { readonly total: number; readonly scheduled: number };
  readonly days: { readonly total: number; readonly empty: number; readonly stops: number };
  readonly checks: Readonly<Record<"open" | "partial" | "closed" | "uncertain" | "unchecked", number>>;
  readonly reservations: number;
  readonly conflicts: Readonly<Record<string, number>>;
  readonly unverifiedFields: number;
  readonly repair: { readonly rounds: number; readonly moved: number };
};

function selectedCities(handoff: PlanHandoff) {
  const destination = handoff.tripState.destination;
  return destination.state === "known"
    ? destination.areas.flatMap(({ province, places }) => places.map(({ name, spots }) => ({ province, city: name, spots })))
    : [];
}

function scheduledCards(plan: ReadyPlan): SpotCard[] {
  const ids = new Set(plan.draft.days.flatMap(({ stops }) => stops.map(({ spotId }) => spotId)));
  return plan.spots.filter(({ id }) => ids.has(id));
}

/** A card answers to an expected name when either holds the other (故宫 and 故宫博物院). */
function namesMatch(card: SpotCard, name: string): boolean {
  return card.name === name || card.name.includes(name) || name.includes(card.name);
}

export function measureRun(capture: RunCapture, handoff: PlanHandoff): RunMetrics {
  const { events, run, plan } = capture;
  const stageMs: Record<string, number> = {};
  let routeAttempts = 0;
  let dayRetries = 0;
  let researchSearches = 0;
  let cards = 0;
  let sourced = 0;
  let mapStopped = false;
  let repair = { rounds: 0, moved: 0 };
  for (const event of events) {
    if (event.type === "stage.finished") {
      stageMs[event.stage] = (stageMs[event.stage] ?? 0) + event.ms;
      if (event.stage === "verify") repair = { rounds: event.summary.rounds ?? 0, moved: event.summary.moved ?? 0 };
    }
    if (event.type === "stage.activity" && event.activity.kind === "routing") routeAttempts += 1;
    if (event.type === "stage.activity" && event.activity.kind === "drafting" && event.activity.attempt > 1) dayRetries += 1;
    if (event.type === "city.researched") {
      researchSearches += event.searches;
      cards += event.cards;
      sourced += event.sourced;
    }
    if (event.type === "map.checked" && event.status === "stopped") mapStopped = true;
  }

  const selected = selectedCities(handoff);
  const requestedTotal = selected.reduce((sum, { city, spots }) => sum + splitRequested(spots, city).spots.length, 0);
  const draft = plan?.draft ?? null;
  const checks = { open: 0, partial: 0, closed: 0, uncertain: 0, unchecked: 0 };
  for (const check of draft?.checks ?? []) checks[check.status] += 1;
  const conflicts: Record<string, number> = {};
  for (const conflict of draft?.conflicts ?? []) conflicts[conflict.kind] = (conflicts[conflict.kind] ?? 0) + 1;

  return {
    status: run?.status ?? "missing",
    errorCode: run?.errorCode ?? null,
    durationMs: run?.durationMs ?? null,
    stageMs,
    inputTokens: run?.usage?.inputTokens ?? null,
    outputTokens: run?.usage?.outputTokens ?? null,
    searches: { research: researchSearches, verify: Math.max((run?.usage?.searches ?? researchSearches) - researchSearches, 0) },
    mapLookups: run?.usage?.mapLookups ?? null,
    mapStopped,
    routeAttempts,
    dayRetries,
    routeSource: draft?.route.source ?? null,
    asked: events.some(({ type }) => type === "run.waiting"),
    cities: { selected: selected.length, routed: draft?.route.cities.length ?? 0, omitted: draft?.route.omitted.length ?? 0 },
    cards: { total: cards, sourced },
    requested: { total: requestedTotal, scheduled: plan ? scheduledCards(plan).filter(({ requested }) => requested).length : 0 },
    days: {
      total: draft?.days.length ?? 0,
      empty: draft?.days.filter(({ stops }) => stops.length === 0).length ?? 0,
      stops: draft?.days.reduce((sum, { stops }) => sum + stops.length, 0) ?? 0,
    },
    checks,
    reservations: draft?.checks?.filter(({ reservation }) => reservation !== null).length ?? 0,
    conflicts,
    unverifiedFields: draft?.unverified.reduce((sum, { fields }) => sum + fields.length, 0) ?? 0,
    repair,
  };
}

export type ExpectationResult = { readonly name: string; readonly passed: boolean; readonly detail: string };

const cjk = /\p{Script=Han}/gu;
const latin = /[A-Za-z]/gu;

/** Each expectation of the case, judged in code against the saved plan and the events. */
export function checkExpectations(evalCase: EvalCase, capture: RunCapture, handoff: PlanHandoff): ExpectationResult[] {
  const { expect } = evalCase;
  const { plan, events } = capture;
  const results: ExpectationResult[] = [];
  const add = (name: string, passed: boolean, detail: string) => results.push({ name, passed, detail });
  if (!plan) {
    add("plan saved", false, `run ${capture.run?.status ?? "missing"} (${capture.run?.errorCode ?? "no error code"})`);
    return results;
  }
  const { draft } = plan;
  const scheduled = scheduledCards(plan);
  const question = events.find((event) => event.type === "run.waiting");

  if (expect.mode !== undefined) add("mode", draft.mode === expect.mode, draft.mode);
  if (expect.keepsAllCities !== undefined) {
    const selected = selectedCities(handoff).map(({ city }) => city);
    const routed = draft.route.cities.map(({ city }) => city);
    const keeps = draft.route.omitted.length === 0 && selected.every((city) => routed.includes(city));
    add("keeps all cities", keeps === expect.keepsAllCities,
      `routed ${routed.join("、") || "none"}; left out ${draft.route.omitted.map(({ city }) => city).join("、") || "none"}`);
  }
  if (expect.asks !== undefined) {
    add("asks", Boolean(question) === expect.asks, question ? `asked: ${question.question.text}` : "did not ask");
  }
  if (expect.leaveOutOptions) {
    const options = question?.question.options ?? [];
    const leaving = options.filter(({ leaveOut }) => leaveOut);
    add("leave-out options name a city", leaving.length > 0,
      options.map(({ label, leaveOut }) => `${label}${leaveOut ? ` → ${leaveOut}` : ""}`).join(" | ") || "no question");
  }
  for (const name of expect.scheduled ?? []) {
    add(`scheduled ${name}`, scheduled.some((card) => namesMatch(card, name)), scheduled.map(({ name: spot }) => spot).join("、"));
  }
  for (const name of expect.notScheduled ?? []) {
    const hit = scheduled.find((card) => card.name === name);
    add(`not scheduled ${name}`, !hit, hit ? `scheduled as ${hit.name}` : "absent");
  }
  for (const name of expect.reservationFound ?? []) {
    const card = scheduled.find((spot) => namesMatch(spot, name));
    const rule = card?.availability?.reservation ?? null;
    add(`reservation found for ${name}`, rule !== null, card ? (rule ? rule.evidence.quote : "no booking rule") : "not scheduled");
  }
  for (const { spot, weekdays } of expect.notOnWeekdays ?? []) {
    const ids = new Set(scheduled.filter((card) => namesMatch(card, spot)).map(({ id }) => id));
    const dates = draft.days.filter(({ stops }) => stops.some(({ spotId }) => ids.has(spotId))).map(({ date }) => date);
    const bad = dates.filter((date) => date !== null && weekdays.includes(weekdayOf(date)));
    add(`${spot} not on weekday ${weekdays.join(",")}`, ids.size > 0 && bad.length === 0,
      ids.size === 0 ? "not scheduled" : `on ${dates.join("、")}`);
  }
  if (expect.maxStopsPerDay !== undefined) {
    const most = Math.max(0, ...draft.days.map(({ stops }) => stops.length));
    add(`at most ${expect.maxStopsPerDay} stops a day`, most <= expect.maxStopsPerDay, `most ${most}`);
  }
  if (expect.noEmptyDays) {
    const empty = draft.days.filter(({ stops }) => stops.length === 0).map(({ day }) => day);
    add("no empty days", empty.length === 0, empty.length ? `empty: ${empty.join(",")}` : "none empty");
  }
  if (expect.englishText) {
    // Place names stay Chinese, so the text counts as English when its letters outnumber its Han characters.
    const text = [...draft.route.cities.map(({ reason }) => reason ?? ""), ...draft.days.map(({ theme }) => theme ?? "")].join(" ");
    const letters = text.match(latin)?.length ?? 0;
    const han = text.match(cjk)?.length ?? 0;
    add("English route and themes", letters > han, `${letters} letters, ${han} Han`);
  }
  return results;
}

