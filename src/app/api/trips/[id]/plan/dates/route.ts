import { cookies } from "next/headers";
import { z } from "zod";

import { TripStateNotFoundError } from "@/capabilities/journey/journey-errors";
import { handlePlanDatesPost } from "@/capabilities/planning/plan-dates";
import { TripNotFoundError } from "@/domain/trip/trip-errors";
import { readGuestId } from "@/platform/identity/guest-identity";

/** Today in Meri's time zone, as the handoff counts it. */
function today(): string {
  const timezone = process.env.MERI_TIMEZONE?.trim() || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const { year, month, day } = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${year}-${month}-${day}`;
}

/** Fills in the trip's dates once on the plan page, for a plan made without them (2026-11-21). */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id: tripId } = await context.params;
  if (!z.uuid().safeParse(tripId).success) {
    return Response.json({ error: { code: "journey_not_found", message: "Journey not found." } },
      { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const [{ journeyService }, { planRunRepository }] = await Promise.all([
    import("@/capabilities/journey/journey-service-instance"),
    import("@/capabilities/planning/plan-run-repository-instance"),
  ]);
  return handlePlanDatesPost(tripId, readGuestId(await cookies()), body, {
    loadJourney: (id, owner) => journeyService.loadJourney(id, owner),
    updateTripState: (id, owner, patch) => journeyService.updateTripState(id, owner, patch),
    findLatestRun: (id) => planRunRepository.findLatestRun(id),
    today,
  }, (error) => error instanceof TripNotFoundError || error instanceof TripStateNotFoundError);
}
