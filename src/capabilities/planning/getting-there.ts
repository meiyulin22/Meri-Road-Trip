import { z } from "zod";

import { planTransport, type TransportDependencies } from "@/agents/transport/transport-agent";
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
  travelChoiceOf,
} from "@/domain/plan/transfer-legs";
import { railCityOfRegion } from "@/platform/rail/rail-names";
import type { LocationField, TripState, TripStatePatch } from "@/domain/trip-state/trip-state";
import type { PlanRunRepository } from "@/platform/persistence/plan-run-repository";

import { canonicalJson, handoffKey } from "./plan-run-service";

/**
 * What the plan page sends when the traveller fills in where they start (1.2107): a place they
 * picked from the map's suggestions, with Tianditu's point, and how they want to travel when the
 * trip did not say. China's bounds hold the point, as the suggestions do. Since 1.2115 either may
 * come alone: a trip with an origin but no way of travelling sends only the choice.
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
  }).nullable(),
  choice: z.enum(travelChoices).nullable(),
}).refine(({ origin, choice }) => origin !== null || choice !== null, { message: "Send a starting point, a way of travelling, or both." });
export type GettingThereRequest = z.output<typeof gettingThereRequestSchema>;

export type GettingThereDependencies = {
  readonly loadJourney: (tripId: string, ownerGuestId: string) => Promise<{ tripState: TripState }>;
  readonly updateTripState: (tripId: string, ownerGuestId: string, patch: TripStatePatch) => Promise<TripState>;
  readonly repository: Pick<PlanRunRepository, "findLatestRun" | "findLatestVersion" | "fillPlanFacts">;
  readonly transfers: TransferDependencies;
  /** Trains for the traveller's choice (1.2108); this is the only step that may take a while. */
  readonly transport: TransportDependencies;
};

export type GettingThereOutcome =
  | { readonly status: "filled"; readonly handoff: PlanHandoff; readonly plan: ReadyPlan }
  /** No finished plan to fill in, or the newest run did not make the newest version. */
  | { readonly status: "no_plan" }
  /** What was sent is already set, here or in the Workspace; each is filled once and then locked. */
  | { readonly status: "already_filled" }
  /** The plan has no origin yet, and only a way of travelling was sent (1.2115). */
  | { readonly status: "origin_required" }
  /** The trip changed in other ways since the plan was made: this plan is out of date. */
  | { readonly status: "plan_stale" };

function originFrom(picked: NonNullable<GettingThereRequest["origin"]>): LocationField {
  const { name, region, coordinates } = picked;
  return {
    state: "known", value: name, source: "user",
    selection: { provider: "tianditu", ...(region ? { region } : {}), coordinates },
  };
}

/** The trip as it would be with only the origin and transport taken from `other`. */
const withGettingThere = (state: TripState, other: TripState): TripState =>
  ({ ...state, origin: other.origin, transportPreference: other.transportPreference });

/** A setting-off or way-home leg as its drive estimate alone, before the transport agent decides again. */
function driveOnly(leg: TransferLeg): TransferLeg {
  return { kind: leg.kind, day: leg.day, from: leg.from, to: leg.to, estimate: leg.estimate };
}

/** 12306's name for where the traveller starts: the place picked here, or the one the trip kept. */
function originRailCity(request: GettingThereRequest, origin: LocationField): string | null {
  if (request.origin) return railCityOfRegion(request.origin.region, request.origin.name);
  return origin.state === "known" && origin.selection?.region ? railCityOfRegion(origin.selection.region, origin.value) : null;
}

/**
 * Fills in the origin once after the plan is made (1.2107), and how to travel when the trip did
 * not say, then estimates only setting off and heading home again: the legs between cities keep
 * what the run found. Since 1.2115 the way of travelling can be filled in alone, for a trip that
 * had an origin but no transport: the traveller cannot go back to the Workspace, so the plan page
 * is where it is chosen; the drives already estimated are kept and only the transport agent runs.
 * TripState is written first, as the authority; then the plan version gets the same TripState, so
 * the plan is not out of date; then the run gets the handoff that matches, so the page finds this
 * plan again. Sending the same request after a failure part-way finishes the rest without writing
 * TripState twice. Each value is filled once and then locked.
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
  const originOpen = version.tripState.origin.state === "missing";
  const transportOpen = version.tripState.transportPreference.state !== "known";
  // Each value is filled once: what the plan already has, here or from the Workspace, stays locked.
  if (request.origin && !originOpen) return { status: "already_filled" };
  if (!request.origin && originOpen) return { status: "origin_required" };
  if (!request.origin && !transportOpen) return { status: "already_filled" };

  const { tripState: current } = await deps.loadJourney(tripId, ownerGuestId);
  // Anything else changed since the plan was made: filling in the origin would not make it current.
  if (canonicalJson(withGettingThere(current, version.tripState)) !== canonicalJson(version.tripState)) {
    return { status: "plan_stale" };
  }
  const choice: TravelChoice | null = transportOpen ? request.choice : null;
  const patch: { -readonly [K in keyof TripStatePatch]: TripStatePatch[K] } = {};
  if (request.origin) {
    const origin = originFrom(request.origin);
    if (current.origin.state === "missing") patch.origin = origin;
    else if (canonicalJson(current.origin) !== canonicalJson(origin)) return { status: "already_filled" };
  }
  if (choice) {
    const preference = { state: "known", value: transportPreferenceFor(choice), source: "user" } as const;
    if (current.transportPreference.state !== "known") patch.transportPreference = preference;
    // Written already by a request that failed part-way: the same choice finishes it, another is refused.
    else if (current.transportPreference.value !== preference.value) return { status: "already_filled" };
  }
  const tripState = Object.keys(patch).length > 0 ? await deps.updateTripState(tripId, ownerGuestId, patch) : current;

  const draft = version.plan.draft;
  const frames: DayFrame[] = draft.days.map(({ day, date, province, city, arrivingFrom, focus, theme }) =>
    ({ day, date, province, city, arrivingFrom, focus, theme }));
  const kept = new Map((draft.transfers ?? []).filter(({ kind }) => kind === "between").map((leg) => [leg.day, leg]));
  // A new origin needs its drives looked up; a choice alone keeps the drives the plan already has
  // and clears only what was said about trains and flights on the way there and back.
  const outcome = request.origin
    ? await planTransfers(
      transferLegs(frames, tripState.origin, draft.mode).map((leg) => leg.kind === "between" ? kept.get(leg.day) ?? leg : leg),
      deps.transfers, () => {}, originPoint(tripState.origin))
    : { legs: (draft.transfers ?? []).map((leg) => leg.kind === "between" ? leg : driveOnly(leg)), lookups: 0 };
  // Trains for the choice made here, or the trip's own preference (none counts as flexible); a self-driver's car goes with them.
  const travel = choice ?? travelChoiceOf(tripState.transportPreference);
  const transport = await planTransport(outcome.legs, {
    choice: travel,
    dates: new Map(frames.map(({ day, date }) => [day, date])),
    originRailCity: originRailCity(request, tripState.origin),
    preferences: run.handoff.preferences.map(({ quote }) => quote),
    locale: run.handoff.locale,
    // The plan page cannot pause a run to ask (1.2112): a long train stays the train.
    allowQuestion: false,
  }, deps.transport);
  const transfers: TransferLeg[] = transport?.legs ?? outcome.legs;

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
      case "already_filled": return failure(409, "already_filled", "This is already set for the plan.");
      case "origin_required": return failure(400, "origin_required", "Pick where you start first.");
      case "plan_stale": return failure(409, "plan_stale", "The journey changed after this plan was made.");
    }
  } catch (error) {
    // The caller says whether this was a missing journey; anything else is logged there.
    return onError(error) ? failure(404, "journey_not_found", "Journey not found.") : failure(500, "internal_error", "Failed to save the starting point.");
  }
}
