import { z } from "zod";

import type { PlanPreference } from "@/domain/plan/trip-preference";
import type { TripState } from "@/domain/trip-state/trip-state";

import { readyPlanSchema, type ReadyPlan } from "./plan-draft-response";
import type { PlanHandoff } from "./plan-handoff";
import { planRunErrorCodes, type PlanRunErrorCode } from "./plan-progress";

/** `suspended`: waiting for the traveller's answer, with the workflow's snapshot in Postgres. */
export const planRunStatuses = ["running", "suspended", "succeeded", "failed", "interrupted"] as const;
export type PlanRunStatus = (typeof planRunStatuses)[number];

/** What one run spent, for the run record and later evaluation. Research model tokens are not counted yet. */
export type PlanRunUsage = {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly searches: number;
  readonly mapLookups: number;
};

/** One Generate plan run: the handoff it was given and how it ended. */
export type PlanRun = {
  readonly id: string;
  readonly tripId: string;
  readonly status: PlanRunStatus;
  readonly handoff: PlanHandoff;
  /** A digest of the handoff, so a second request for the same handoff joins this run or reads its plan. */
  readonly handoffKey: string;
  readonly errorCode: PlanRunErrorCode | null;
  readonly usage: PlanRunUsage | null;
  readonly startedAt: string;
  readonly finishedAt: string | null;
  readonly durationMs: number | null;
};

export type PlanRunFinish = Pick<PlanRun, "errorCode" | "usage" | "durationMs"> & {
  readonly status: Exclude<PlanRunStatus, "running" | "suspended">;
  readonly finishedAt: string;
};

/**
 * A saved plan, numbered per trip. It keeps the TripState and preferences it was built
 * from: a plan never writes TripState, and a later change to the trip makes it stale.
 */
export type PlanVersion = {
  readonly id: string;
  readonly tripId: string;
  readonly runId: string;
  readonly version: number;
  readonly tripState: TripState;
  readonly preferences: readonly PlanPreference[];
  readonly plan: ReadyPlan;
  readonly createdAt: string;
};

/** What POST plan-runs answers: the saved plan for this handoff, the run making it, or why there is none. */
export const planRunStartResponseSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("ready"), runId: z.uuid(), versionId: z.uuid(), plan: readyPlanSchema }),
  z.strictObject({ status: z.literal("running"), runId: z.uuid() }),
  z.strictObject({ status: z.literal("unsupported"), reason: z.literal("no_city") }),
]);
export type PlanRunStartResponse = z.output<typeof planRunStartResponseSchema>;

/** What the plan page sends to answer a run's question: an option's label, or null for "you decide". */
export const planAnswerSchema = z.strictObject({
  questionId: z.uuid(),
  choice: z.string().trim().min(1).max(40).nullable(),
});
export type PlanAnswer = z.output<typeof planAnswerSchema>;

/** What GET plan answers: the newest saved plan, whether the trip changed since, and the newest run. */
export const latestPlanResponseSchema = z.strictObject({
  version: z.strictObject({
    id: z.uuid(),
    version: z.number().int().positive(),
    runId: z.uuid(),
    createdAt: z.iso.datetime(),
    stale: z.boolean(),
    plan: readyPlanSchema,
  }).nullable(),
  run: z.strictObject({
    id: z.uuid(),
    status: z.enum(planRunStatuses),
    errorCode: z.enum(planRunErrorCodes).nullable(),
    startedAt: z.iso.datetime(),
    finishedAt: z.iso.datetime().nullable(),
  }).nullable(),
});
export type LatestPlanResponse = z.output<typeof latestPlanResponseSchema>;
