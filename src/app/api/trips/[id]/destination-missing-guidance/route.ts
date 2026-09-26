import { randomUUID } from "node:crypto";

import { cookies } from "next/headers";

import type { TripMessage } from "@/domain/trip-message/trip-message";
import type { TripState } from "@/domain/trip-state/trip-state";
import { TripNotFoundError } from "@/domain/trip/trip-errors";
import { readGuestId } from "@/server/identity/guest-identity";
import { TripStateNotFoundError } from "@/server/journey/journey-errors";
import { logger } from "@/server/observability/logger";
import { serializeError } from "@/server/observability/serialize-error";

type RouteContext = { params: Promise<{ id: string }> };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidJourneyId(value: string): boolean {
  return uuidPattern.test(value);
}

function response(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function notFound(): Response {
  return response({ error: { code: "journey_not_found", message: "Journey not found." } }, 404);
}

export async function handleDestinationMissingGuidancePost(
  tripId: string,
  ownerGuestId: string | null,
  loadJourney: (tripId: string, ownerGuestId: string) => Promise<{ tripState: TripState }>,
  persistGuidance: (tripId: string, ownerGuestId: string) => Promise<TripMessage>,
): Promise<Response> {
  if (!ownerGuestId) return notFound();

  try {
    const { tripState } = await loadJourney(tripId, ownerGuestId);
    if (tripState.destination.state !== "missing") {
      return response({ error: { code: "destination_not_missing", message: "Destination is no longer missing." } }, 409);
    }
    const message = await persistGuidance(tripId, ownerGuestId);
    return response({ message }, 200);
  } catch (error) {
    if (error instanceof TripNotFoundError || error instanceof TripStateNotFoundError) return notFound();
    logger.error({ requestId: randomUUID(), tripId, error: serializeError(error) },
      "Destination guidance persistence failed");
    return response({ error: { code: "internal_error", message: "Failed to save Meri guidance." } }, 500);
  }
}

export async function POST(_request: Request, context: RouteContext): Promise<Response> {
  const { id: tripId } = await context.params;
  const ownerGuestId = readGuestId(await cookies());
  if (!ownerGuestId || !isValidJourneyId(tripId)) return notFound();
  const [{ journeyService }, { tripMessageService }] = await Promise.all([
    import("@/server/journey/journey-service-instance"),
    import("@/server/trip-message/trip-message-service-instance"),
  ]);
  return handleDestinationMissingGuidancePost(
    tripId,
    ownerGuestId,
    (id, owner) => journeyService.loadJourney(id, owner),
    (id, owner) => tripMessageService.persistDestinationMissingGuidance({ tripId: id, ownerGuestId: owner }),
  );
}
