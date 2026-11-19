import { z } from "zod";

import { switchLegMode } from "@/domain/plan/leg-mode";
import type { ReadyPlan } from "@/domain/plan/plan-draft-response";
import type { TripState } from "@/domain/trip-state/trip-state";
import type { PlanRunRepository } from "@/platform/persistence/plan-run-repository";

import { canonicalJson, handoffKey } from "./plan-run-service";

/** What the plan page sends to switch setting off or heading home between train and flight (1.2115). */
export const legModeRequestSchema = z.strictObject({
  leg: z.enum(["outbound", "return"]),
  mode: z.enum(["flight", "train"]),
});
export type LegModeRequest = z.output<typeof legModeRequestSchema>;

export type LegModeDependencies = {
  readonly loadJourney: (tripId: string, ownerGuestId: string) => Promise<{ tripState: TripState }>;
  readonly repository: Pick<PlanRunRepository, "findLatestRun" | "findLatestVersion" | "fillPlanFacts">;
};

export type LegModeOutcome =
  | { readonly status: "switched"; readonly plan: ReadyPlan }
  | { readonly status: "no_plan" }
  /** The trip changed since the plan was made: this plan is out of date. */
  | { readonly status: "plan_stale" }
  /** This leg has no such choice: both a train over 12 hours and a flight must have been found. */
  | { readonly status: "not_offered" };

/**
 * Switches one end leg of the newest plan between the train and the flight it already found
 * (1.2115). Only this plan changes: TripState keeps the way of travelling the traveller locked, the
 * version is updated in place with the same TripState and the run keeps its handoff, so the page
 * finds this plan again. Nothing is looked up and no model is asked.
 */
export async function switchPlanLegMode(
  tripId: string,
  ownerGuestId: string,
  request: LegModeRequest,
  deps: LegModeDependencies,
): Promise<LegModeOutcome> {
  const [version, run] = await Promise.all([deps.repository.findLatestVersion(tripId), deps.repository.findLatestRun(tripId)]);
  if (!version || !run || run.id !== version.runId || run.status !== "succeeded") return { status: "no_plan" };
  // Loading the journey also checks the trip is this visitor's.
  const { tripState } = await deps.loadJourney(tripId, ownerGuestId);
  if (canonicalJson(tripState) !== canonicalJson(version.tripState)) return { status: "plan_stale" };
  const transfers = version.plan.draft.transfers ?? [];
  const at = transfers.findIndex(({ kind }) => kind === request.leg);
  const switched = at < 0 ? null : switchLegMode(transfers[at], request.mode, run.handoff.locale);
  if (!switched) return { status: "not_offered" };
  const plan: ReadyPlan = { ...version.plan, draft: { ...version.plan.draft, transfers: transfers.map((leg, index) => index === at ? switched : leg) } };
  const saved = await deps.repository.fillPlanFacts({
    versionId: version.id, runId: run.id, tripState: version.tripState, plan, handoff: run.handoff, handoffKey: handoffKey(run.handoff),
  });
  return saved ? { status: "switched", plan } : { status: "no_plan" };
}

/** The HTTP answer for the plan page: the plan with the leg switched. */
export async function handleLegModePost(
  tripId: string,
  ownerGuestId: string | null,
  body: unknown,
  deps: LegModeDependencies,
  onError: (error: unknown) => boolean,
): Promise<Response> {
  const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
  const failure = (status: number, code: string, message: string) => json({ error: { code, message } }, status);
  if (!ownerGuestId) return failure(404, "journey_not_found", "Journey not found.");
  const parsed = legModeRequestSchema.safeParse(body);
  if (!parsed.success) return failure(400, "invalid_request", "Choose setting off or heading home, and flight or train.");
  try {
    const outcome = await switchPlanLegMode(tripId, ownerGuestId, parsed.data, deps);
    switch (outcome.status) {
      case "switched": return json({ plan: outcome.plan });
      case "no_plan": return failure(409, "no_plan", "There is no finished plan to change.");
      case "plan_stale": return failure(409, "plan_stale", "The journey changed after this plan was made.");
      case "not_offered": return failure(409, "not_offered", "This leg has no train and flight to switch between.");
    }
  } catch (error) {
    return onError(error) ? failure(404, "journey_not_found", "Journey not found.") : failure(500, "internal_error", "Failed to change the plan.");
  }
}
