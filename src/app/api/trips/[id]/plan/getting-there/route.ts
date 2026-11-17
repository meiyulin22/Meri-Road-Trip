import { cookies } from "next/headers";
import { z } from "zod";

import { TripStateNotFoundError } from "@/capabilities/journey/journey-errors";
import { handleGettingTherePost } from "@/capabilities/planning/getting-there";
import { TripNotFoundError } from "@/domain/trip/trip-errors";
import { readGuestId } from "@/platform/identity/guest-identity";
import { logger } from "@/platform/observability/logger";
import { serializeError } from "@/platform/observability/serialize-error";

/** Fills in where the traveller starts, once, after the plan is made (1.2107). */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id: tripId } = await context.params;
  const ownerGuestId = readGuestId(await cookies());
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
  const [{ journeyService }, { planRunRepository }, { planGenerationDependencies }] = await Promise.all([
    import("@/capabilities/journey/journey-service-instance"),
    import("@/capabilities/planning/plan-run-repository-instance"),
    import("@/agents"),
  ]);
  return handleGettingTherePost(tripId, ownerGuestId, body, {
    loadJourney: (id, owner) => journeyService.loadJourney(id, owner),
    updateTripState: (id, owner, patch) => journeyService.updateTripState(id, owner, patch),
    repository: planRunRepository,
    transfers: planGenerationDependencies().transfers,
  }, (error) => {
    if (error instanceof TripNotFoundError || error instanceof TripStateNotFoundError) return true;
    logger.error({ tripId, error: serializeError(error) }, "Starting point could not be saved");
    return false;
  });
}
