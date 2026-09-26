import { randomUUID } from "node:crypto";

import { cookies } from "next/headers";

import type { GeneratePlanReadiness } from "@/domain/trip-state/planning-readiness";
import type { TripState } from "@/domain/trip-state/trip-state";
import { TripNotFoundError } from "@/domain/trip/trip-errors";
import { AmapLocationProvider } from "@/infrastructure/location/amap-location-provider";
import { readGuestId } from "@/server/identity/guest-identity";
import { TripStateNotFoundError } from "@/server/journey/journey-errors";
import { checkGeneratePlanReadiness } from "@/server/location/generate-plan-readiness";
import { LocationService } from "@/server/location/location-service";
import { logger } from "@/server/observability/logger";
import { serializeError } from "@/server/observability/serialize-error";

type RouteContext = { params: Promise<{ id: string }> };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function noStore(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function notFound(): Response {
  return noStore({ error: { code: "journey_not_found", message: "Journey not found." } }, 404);
}

export async function handlePlanningReadinessGet(
  tripId: string,
  ownerGuestId: string | null,
  loadJourney: (tripId: string, ownerGuestId: string) => Promise<{ tripState: TripState }>,
  checkReadiness: (tripState: TripState) => Promise<GeneratePlanReadiness>,
): Promise<Response> {
  if (!ownerGuestId) return notFound();

  try {
    const journey = await loadJourney(tripId, ownerGuestId);
    return noStore(await checkReadiness(journey.tripState));
  } catch (error) {
    if (error instanceof TripNotFoundError || error instanceof TripStateNotFoundError) {
      return notFound();
    }
    logger.error(
      { requestId: randomUUID(), tripId, error: serializeError(error) },
      "Planning readiness check failed",
    );
    return noStore({ error: { code: "internal_error", message: "Failed to check planning readiness." } }, 500);
  }
}

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const { id: tripId } = await context.params;
  const ownerGuestId = readGuestId(await cookies());
  if (!ownerGuestId || !uuidPattern.test(tripId)) return notFound();
  const { journeyService } = await import("@/server/journey/journey-service-instance");
  const locationService = new LocationService(new AmapLocationProvider());
  return handlePlanningReadinessGet(
    tripId,
    ownerGuestId,
    (id, owner) => journeyService.loadJourney(id, owner),
    (tripState) => checkGeneratePlanReadiness(tripState, locationService),
  );
}
