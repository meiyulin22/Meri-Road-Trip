import { z } from "zod";

import { planTransfers, type TransferDependencies } from "@/agents/transport/transfers";
import type { DayFrame } from "@/domain/plan/plan-draft";
import type { ReadyPlan } from "@/domain/plan/plan-draft-response";
import type { PlanHandoff } from "@/domain/plan/plan-handoff";
import {
  originPoint,
  type TransferLeg,
  transferLegs,
  travelChoices,
  type TravelChoice,
  transportPreferenceFor,
} from "@/domain/plan/transfer-legs";
import type { LocationField, TripState, TripStatePatch } from "@/domain/trip-state/trip-state";
import type { PlanRunRepository } from "@/platform/persistence/plan-run-repository";

import { canonicalJson, handoffKey } from "./plan-run-service";

/**
 * What the plan page sends when the traveller fills in where they start (1.2107): a place they
 * picked from the map's suggestions, with Tianditu's point, and how they want to travel when the
 * trip did not say. China's bounds hold the point, as the suggestions do.
 */
export const gettingThereRequestSchema = z.strictObject({
  origin: z.strictObject({
    name: z.string().trim().min(1).max(80),
    region: z.string().trim().min(1).max(120).nullable(),
    coordinates: z.strictObject({
      longitude: z.number().min(73).max(136),
      latitude: z.number().min(3).max(54),
      coordinateSystem: z.literal("CGCS2000"),
    }),
  }),
  choice: z.enum(travelChoices).nullable(),
});
export type GettingThereRequest = z.output<typeof gettingThereRequestSchema>;

export type GettingThereDependencies = {
  readonly loadJourney: (tripId: string, ownerGuestId: string) => Promise<{ tripState: TripState }>;
  readonly updateTripState: (tripId: string, ownerGuestId: string, patch: TripStatePatch) => Promise<TripState>;
  readonly repository: Pick<PlanRunRepository, "findLatestRun" | "findLatestVersion" | "fillPlanFacts">;
  readonly transfers: TransferDependencies;
};

export type GettingThereOutcome =
  | { readonly status: "filled"; readonly handoff: PlanHandoff; readonly plan: ReadyPlan }
  /** No finished plan to fill in, or the newest run did not make the newest version. */
  | { readonly status: "no_plan" }
  /** The origin is already set, here or in the Workspace; it is filled once. */
  | { readonly status: "already_filled" }
  /** The trip changed in other ways since the plan was made: this plan is out of date. */
  | { readonly status: "plan_stale" };

function originFrom(request: GettingThereRequest): LocationField {
  const { name, region, coordinates } = request.origin;
  return {
    state: "known", value: name, source: "user",
    selection: { provider: "tianditu", ...(region ? { region } : {}), coordinates },
  };
}

/** The trip as it would be with only the origin and transport taken from `other`. */
const withGettingThere = (state: TripState, other: TripState): TripState =>
  ({ ...state, origin: other.origin, transportPreference: other.transportPreference });

/**
 * Fills in the origin once after the plan is made (1.2107), and how to travel when the trip did
 * not say, then estimates only setting off and heading home again: the legs between cities keep
 * what the run found. TripState is written first, as the authority; then the plan version gets
 * the same TripState, so the plan is not out of date; then the run gets the handoff that matches,
 * so the page finds this plan again. Sending the same request after a failure part-way finishes
 * the rest without writing TripState twice. No model is asked.
 */
export async function fillGettingThere(
  tripId: string,
  ownerGuestId: string,
  request: GettingThereRequest,
  deps: GettingThereDependencies,
): Promise<GettingThereOutcome> {
  const [version, run] = await Promise.all([
    deps.repository.findLatestVersion(tripId),
    deps.repository.findLatestRun(tripId),
  ]);
  if (!version || !run || run.id !== version.runId || run.status !== "succeeded") return { status: "no_plan" };
  if (version.tripState.origin.state !== "missing") return { status: "already_filled" };

  const { tripState: current } = await deps.loadJourney(tripId, ownerGuestId);
  // Anything else changed since the plan was made: filling in the origin would not make it current.
  if (canonicalJson(withGettingThere(current, version.tripState)) !== canonicalJson(version.tripState)) {
    return { status: "plan_stale" };
  }
  const origin = originFrom(request);
  const transportOpen = version.tripState.transportPreference.state !== "known";
  const choice: TravelChoice | null = transportOpen ? request.choice : null;
  const patch: { -readonly [K in keyof TripStatePatch]: TripStatePatch[K] } = {};
  if (current.origin.state === "missing") patch.origin = origin;
  else if (canonicalJson(current.origin) !== canonicalJson(origin)) return { status: "already_filled" };
  if (choice && current.transportPreference.state !== "known") {
    patch.transportPreference = { state: "known", value: transportPreferenceFor(choice), source: "user" };
  }
  const tripState = Object.keys(patch).length > 0 ? await deps.updateTripState(tripId, ownerGuestId, patch) : current;

  const draft = version.plan.draft;
  const frames: DayFrame[] = draft.days.map(({ day, date, province, city, arrivingFrom, focus, theme }) =>
    ({ day, date, province, city, arrivingFrom, focus, theme }));
  const kept = new Map((draft.transfers ?? []).filter(({ kind }) => kind === "between").map((leg) => [leg.day, leg]));
  const legs = transferLegs(frames, tripState.origin, draft.mode).map((leg) => leg.kind === "between" ? kept.get(leg.day) ?? leg : leg);
  const outcome = await planTransfers(legs, deps.transfers, () => {}, originPoint(tripState.origin));
  const transfers: TransferLeg[] = outcome.legs;

  const plan: ReadyPlan = { ...version.plan, draft: { ...draft, transfers }, ...(choice ? { travelChoice: choice } : {}) };
  const handoff: PlanHandoff = { ...run.handoff, tripState };
  const saved = await deps.repository.fillPlanFacts({
    versionId: version.id, runId: run.id, tripState, plan, handoff, handoffKey: handoffKey(handoff),
  });
  if (!saved) return { status: "no_plan" };
  return { status: "filled", handoff, plan };
}

/** The HTTP answer for the plan page: the plan and the handoff the tab keeps from now on. */
export async function handleGettingTherePost(
  tripId: string,
  ownerGuestId: string | null,
  body: unknown,
  deps: GettingThereDependencies,
  onError: (error: unknown) => boolean,
): Promise<Response> {
  const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
  const failure = (status: number, code: string, message: string) => json({ error: { code, message } }, status);
  if (!ownerGuestId) return failure(404, "journey_not_found", "Journey not found.");
  const parsed = gettingThereRequestSchema.safeParse(body);
  if (!parsed.success) return failure(400, "invalid_request", "Pick a place from the suggestions.");
  try {
    const outcome = await fillGettingThere(tripId, ownerGuestId, parsed.data, deps);
    switch (outcome.status) {
      case "filled": return json({ handoff: outcome.handoff, plan: outcome.plan });
      case "no_plan": return failure(409, "no_plan", "There is no finished plan to fill in.");
      case "already_filled": return failure(409, "already_filled", "The starting point is already set.");
      case "plan_stale": return failure(409, "plan_stale", "The journey changed after this plan was made.");
    }
  } catch (error) {
    // The caller says whether this was a missing journey; anything else is logged there.
    return onError(error) ? failure(404, "journey_not_found", "Journey not found.") : failure(500, "internal_error", "Failed to save the starting point.");
  }
}
