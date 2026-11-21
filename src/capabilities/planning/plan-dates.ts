import { z } from "zod";

import type { PlanHandoff } from "@/domain/plan/plan-handoff";
import type { PlanRun } from "@/domain/plan/plan-run";
import { parseExactDate, parseExactDays } from "@/domain/trip-state/trip-dates";
import type { TripState, TripStatePatch } from "@/domain/trip-state/trip-state";

/**
 * Filling in the dates once on the plan page (merlin, 2026-11-12 and 2026-11-21). The journey is
 * locked after Generate plan, so a plan made without a start date had no way to get one, and so no
 * weather, outfits or hotels. The plan page now takes a start date (and an end date when the trip's
 * length is not known) once; the dates are written to the journey and then locked like everything
 * else, and the page makes the whole plan again from a new handoff, since dates touch the weather,
 * the route, each day, opening days, outfits and hotels.
 */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
export const planDatesRequestSchema = z.strictObject({ startDate: isoDate, endDate: isoDate.nullable() });
export type PlanDatesRequest = z.output<typeof planDatesRequestSchema>;

export type PlanDatesDependencies = {
  readonly loadJourney: (tripId: string, ownerGuestId: string) => Promise<{ tripState: TripState }>;
  readonly updateTripState: (tripId: string, ownerGuestId: string, patch: TripStatePatch) => Promise<TripState>;
  readonly findLatestRun: (tripId: string) => Promise<PlanRun | null>;
  /** Today in the trip's time zone, YYYY-MM-DD: the earliest start, and the new handoff's reference date. */
  readonly today: () => string;
};

export type PlanDatesOutcome =
  | { readonly status: "filled"; readonly handoff: PlanHandoff }
  /** The journey has no plan run: its Workspace is still open for dates. */
  | { readonly status: "no_plan" }
  /** The start date is already exact; dates are filled once, then locked. */
  | { readonly status: "already_filled" }
  | { readonly status: "invalid_dates"; readonly reason: "past" | "too_far" | "end_before_start" | "end_required" | "end_mismatch" | "too_long" };

const dayMs = 24 * 60 * 60 * 1_000;
const maxDaysAhead = 365;
const maxTripDays = 60;
const time = (date: string) => Date.parse(date + "T00:00:00Z");

/** Whether the dates sent can be the trip's, given its known length; the reason when not. */
export function checkPlanDates(request: PlanDatesRequest, tripState: TripState, today: string): PlanDatesOutcome | null {
  const start = time(request.startDate);
  const now = time(today);
  if (Number.isNaN(start) || start < now) return { status: "invalid_dates", reason: "past" };
  if (start > now + maxDaysAhead * dayMs) return { status: "invalid_dates", reason: "too_far" };
  const days = parseExactDays(tripState.duration);
  if (request.endDate === null) return days === null ? { status: "invalid_dates", reason: "end_required" } : null;
  const end = time(request.endDate);
  if (Number.isNaN(end) || end < start) return { status: "invalid_dates", reason: "end_before_start" };
  const length = Math.round((end - start) / dayMs) + 1;
  if (length > maxTripDays) return { status: "invalid_dates", reason: "too_long" };
  if (days !== null && days !== length) return { status: "invalid_dates", reason: "end_mismatch" };
  return null;
}

/**
 * Writes the dates once and returns the handoff the plan page makes the plan again from: the last
 * run's, with the journey as it now stands and today as its reference date. The end and the length
 * follow from what was sent, as everywhere else dates are edited.
 */
export async function fillPlanDates(
  tripId: string,
  ownerGuestId: string,
  request: PlanDatesRequest,
  deps: PlanDatesDependencies,
): Promise<PlanDatesOutcome> {
  const run = await deps.findLatestRun(tripId);
  // Loading the journey also checks the trip is this visitor's.
  const { tripState } = await deps.loadJourney(tripId, ownerGuestId);
  if (!run) return { status: "no_plan" };
  if (parseExactDate(tripState.startDate) !== null) return { status: "already_filled" };
  const today = deps.today();
  const problem = checkPlanDates(request, tripState, today);
  if (problem) return problem;
  const patch: TripStatePatch = {
    startDate: { state: "known", value: request.startDate, source: "user" },
    ...(request.endDate ? { endDate: { state: "known", value: request.endDate, source: "user" } } : {}),
  };
  const next = await deps.updateTripState(tripId, ownerGuestId, patch);
  return { status: "filled", handoff: { ...run.handoff, tripState: next, referenceDate: today } };
}

const statusOf: Record<Exclude<PlanDatesOutcome["status"], "filled">, number> = {
  no_plan: 409, already_filled: 409, invalid_dates: 400,
};

/** The HTTP answer for a dates request, for the route. */
export async function handlePlanDatesPost(
  tripId: string,
  ownerGuestId: string | null,
  body: unknown,
  deps: PlanDatesDependencies,
  isNotFound: (error: unknown) => boolean,
): Promise<Response> {
  const headers = { "Cache-Control": "no-store" };
  if (!ownerGuestId) return Response.json({ error: { code: "journey_not_found", message: "Journey not found." } }, { status: 404, headers });
  const parsed = planDatesRequestSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: { code: "invalid_dates", message: "Send a start date, and an end date or null." } }, { status: 400, headers });
  try {
    const outcome = await fillPlanDates(tripId, ownerGuestId, parsed.data, deps);
    if (outcome.status === "filled") return Response.json({ handoff: outcome.handoff }, { headers });
    const reason = outcome.status === "invalid_dates" ? outcome.reason : null;
    return Response.json({ error: { code: outcome.status, ...(reason ? { reason } : {}), message: "The dates were not filled in." } },
      { status: statusOf[outcome.status], headers });
  } catch (error) {
    if (isNotFound(error)) return Response.json({ error: { code: "journey_not_found", message: "Journey not found." } }, { status: 404, headers });
    throw error;
  }
}
