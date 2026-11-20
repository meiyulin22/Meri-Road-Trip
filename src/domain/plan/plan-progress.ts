import { z } from "zod";

import { maxPreferenceLabelLength, paceDirections, preferenceKinds } from "./trip-preference";
import { dayOutfitSchema, placeImageSchema, planDaySchema, planRouteSchema, spotCardSchema, stopCheckSchema } from "./plan-draft-response";

/**
 * The stages of a plan run, in the order the plan page shows them. Each is one step of
 * the plan-generation workflow; the page renders its own words for them, in zh or en.
 */
export const planStages = ["scope", "research", "map", "route", "transfers", "days", "verify", "drive", "outfit", "photos", "save"] as const;
export type PlanStage = (typeof planStages)[number];

const count = z.number().int().nonnegative();
const name = z.string().min(1);

/**
 * What a running stage is doing right now, as data. Only real work produces one: a
 * search sent, a spot looked up, a model call started. A single long model call has no
 * inner progress, so it is one activity until it returns.
 */
export const planActivitySchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("nominating"), city: name }),
  z.strictObject({ kind: z.literal("searching"), city: name, names: z.array(name), done: count, total: count }),
  z.strictObject({ kind: z.literal("reviewing"), city: name, sources: count }),
  z.strictObject({ kind: z.literal("extracting"), city: name, sources: count }),
  z.strictObject({ kind: z.literal("locating"), city: name, spot: name, done: count, total: count }),
  /** One city's weather asked of Open-Meteo, for this many points (1.2117). */
  z.strictObject({ kind: z.literal("forecasting"), city: name, points: count }),
  z.strictObject({ kind: z.literal("routing"), cities: count, days: count, attempt: count }),
  z.strictObject({ kind: z.literal("drafting"), city: name, days: z.array(z.number().int().positive()), attempt: count }),
  z.strictObject({ kind: z.literal("verifying"), city: name, spot: name, done: count, total: count }),
  z.strictObject({ kind: z.literal("repairing"), days: z.array(z.number().int().positive()), round: count }),
  /** One drive leg looked up or remembered (1.2102), between stops or, in transfers, between cities (1.2106). */
  z.strictObject({ kind: z.literal("driving"), from: name, to: name, done: count, total: count }),
  /** One train search between two cities sent to 12306 (1.2108). */
  z.strictObject({ kind: z.literal("trains"), from: name, to: name, done: count, total: count }),
  /** One flight fare search sent to VariFlight (1.2111). */
  z.strictObject({ kind: z.literal("flights"), from: name, to: name, done: count, total: count }),
]);
export type PlanActivity = z.output<typeof planActivitySchema>;

const cityStatus = z.enum(["ready", "partial", "unavailable", "deferred"]);

/** The workflow steps that may pause to ask the traveller. */
export const questionSteps = ["plan-route", "transfer-legs"] as const;
export type QuestionStep = (typeof questionSteps)[number];

/**
 * What the Plan Agent asks while routing, when the preferences leave a real choice open.
 * Each option says which kind of preference it expresses, so the answer is saved as one.
 */
export const planQuestionSchema = z.strictObject({
  id: z.uuid(),
  text: z.string().trim().min(1).max(120),
  /**
   * The workflow step that asked and is resumed with the answer: the route (1.2011) or the
   * transport question (1.2112), which takes no written answer. Older questions have none: the route.
   */
  step: z.enum(questionSteps).optional(),
  options: z.array(z.strictObject({
    label: z.string().trim().min(1).max(maxPreferenceLabelLength),
    kind: z.enum(preferenceKinds),
    /** Which way a pace option leans, saved with the answer (1.2017); older questions have none. */
    pace: z.enum(paceDirections).nullable().optional(),
    /** The city this option leaves out, when choosing it means a smaller trip. Older questions have none. */
    leaveOut: z.string().min(1).nullable().optional(),
  })).min(2).max(3),
});
export type PlanQuestion = z.output<typeof planQuestionSchema>;

export const planRunEndings = ["succeeded", "failed", "interrupted"] as const;
export type PlanRunEnding = (typeof planRunEndings)[number];

/** Why a run failed, for the page to word; never a provider message. */
/**
 * Why a run ended without a plan. `daily_quota` and `paid_calls_paused` (step 2): Kimi was refused
 * mid-run because the day's money was spent or PAID_CALLS_ENABLED was turned off.
 */
export const planRunErrorCodes = ["planner_unavailable", "time_limit", "internal_error", "interrupted", "daily_quota", "paid_calls_paused"] as const;
export type PlanRunErrorCode = (typeof planRunErrorCodes)[number];

export const planProgressEventSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("stage.started"), stage: z.enum(planStages) }),
  z.strictObject({ type: z.literal("stage.activity"), stage: z.enum(planStages), activity: planActivitySchema }),
  /** The numbers shown on the collapsed ✓ line; which keys a stage has is fixed per stage. */
  z.strictObject({ type: z.literal("stage.finished"), stage: z.enum(planStages), ms: count, summary: z.record(z.string(), count) }),
  z.strictObject({
    type: z.literal("scope.ready"),
    mode: z.enum(["preview", "full"]),
    totalDays: z.number().int().positive().nullable(),
    cities: z.array(z.strictObject({ province: name, city: name })),
    deferred: z.array(name),
    pendingProvinces: z.array(name),
  }),
  z.strictObject({
    type: z.literal("city.researched"),
    province: name, city: name, status: cityStatus, cards: count, sourced: count, searches: count, ms: count,
  }),
  z.strictObject({ type: z.literal("map.checked"), status: z.enum(["complete", "stopped"]), located: count, notLocated: count, lookups: count }),
  z.strictObject({ type: z.literal("route.ready"), route: planRouteSchema }),
  /** One day as soon as its city is drafted, with the cards its stops refer to. */
  z.strictObject({ type: z.literal("day.ready"), day: planDaySchema, spots: z.array(spotCardSchema) }),
  z.strictObject({ type: z.literal("day.photo"), day: z.number().int().positive(), image: placeImageSchema }),
  /** One day's outfit once the whole trip is dressed (1.2117). */
  z.strictObject({ type: z.literal("day.outfit"), outfit: dayOutfitSchema }),
  /** The second round's verdict for one stop where it now is; sent again when a repair moves it. */
  z.strictObject({ type: z.literal("spot.checked"), check: stopCheckSchema }),
  /** The run is paused until the traveller answers; it is saved and survives a restart. */
  z.strictObject({ type: z.literal("run.waiting"), question: planQuestionSchema }),
  /** The traveller's choice, or null for "you decide"; the run goes on from the route. */
  z.strictObject({ type: z.literal("question.answered"), questionId: z.uuid(), choice: z.string().min(1).nullable() }),
  z.strictObject({
    type: z.literal("run.finished"),
    status: z.enum(planRunEndings),
    versionId: z.uuid().nullable(),
    errorCode: z.enum(planRunErrorCodes).nullable(),
    ms: count,
  }),
]);
export type PlanProgressEvent = z.output<typeof planProgressEventSchema>;

/** One event as stored and sent: its place in the run and the server time it happened. */
export const planProgressEnvelopeSchema = z.strictObject({
  runId: z.uuid(),
  seq: z.number().int().positive(),
  at: z.number().int().nonnegative(),
  event: planProgressEventSchema,
});
export type PlanProgressEnvelope = z.output<typeof planProgressEnvelopeSchema>;
