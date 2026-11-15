import { z } from "zod";

import { placeImageSchema, planDaySchema, planRouteSchema, spotCardSchema } from "./plan-draft-response";

/**
 * The stages of a plan run, in the order the plan page shows them. Each is one step of
 * the plan-generation workflow; the page renders its own words for them, in zh or en.
 */
export const planStages = ["scope", "research", "map", "route", "days", "photos", "save"] as const;
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
  z.strictObject({ kind: z.literal("routing"), cities: count, days: count, attempt: count }),
  z.strictObject({ kind: z.literal("drafting"), city: name, days: z.array(z.number().int().positive()), attempt: count }),
]);
export type PlanActivity = z.output<typeof planActivitySchema>;

const cityStatus = z.enum(["ready", "partial", "unavailable", "deferred"]);

export const planRunEndings = ["succeeded", "failed", "interrupted"] as const;
export type PlanRunEnding = (typeof planRunEndings)[number];

/** Why a run failed, for the page to word; never a provider message. */
export const planRunErrorCodes = ["planner_unavailable", "time_limit", "internal_error", "interrupted"] as const;
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
