import { cookies } from "next/headers";
import { z } from "zod";

import { TripStateNotFoundError } from "@/capabilities/journey/journey-errors";
import { handleLegModePost } from "@/capabilities/planning/plan-leg-mode";
import { TripNotFoundError } from "@/domain/trip/trip-errors";
import { readGuestId } from "@/platform/identity/guest-identity";
import { logger } from "@/platform/observability/logger";
import { serializeError } from "@/platform/observability/serialize-error";

/** Switches setting off or heading home between the train and flight already found (1.2115). No model, no lookup. */
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
  const [{ journeyService }, { planRunRepository }] = await Promise.all([
    import("@/capabilities/journey/journey-service-instance"),
    import("@/capabilities/planning/plan-run-repository-instance"),
  ]);
  return handleLegModePost(tripId, ownerGuestId, body, {
    loadJourney: (id, owner) => journeyService.loadJourney(id, owner),
    repository: planRunRepository,
  }, (error) => {
    if (error instanceof TripNotFoundError || error instanceof TripStateNotFoundError) return true;
    logger.error({ tripId, error: serializeError(error) }, "Plan leg could not be switched");
    return false;
  });
}
