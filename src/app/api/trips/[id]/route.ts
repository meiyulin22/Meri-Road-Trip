import { randomUUID } from "node:crypto";

import { cookies } from "next/headers";

import { readGuestId } from "@/server/identity/guest-identity";
import { journeyService } from "@/server/journey/journey-service-instance";
import { logger, logEvents } from "@/server/observability/logger";
import { serializeError } from "@/server/observability/serialize-error";

type TripRouteContext = {
  params: Promise<{ id: string }>;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(_request: Request, context: TripRouteContext) {
  const requestId = randomUUID();
  const { id: tripId } = await context.params;

  try {
    const ownerGuestId = readGuestId(await cookies());
    if (!ownerGuestId || !uuidPattern.test(tripId)) {
      return notFound();
    }

    const deleted = await journeyService.deleteJourney(tripId, ownerGuestId);
    if (!deleted) {
      return notFound();
    }

    logger.info(
      { event: logEvents.journeyDeleted, requestId, tripId },
      "Journey deleted",
    );
    return new Response(null, { status: 204 });
  } catch (error) {
    logger.error(
      {
        event: logEvents.journeyDeleteFailed,
        requestId,
        tripId,
        error: serializeError(error),
      },
      "Journey deletion failed",
    );
    return Response.json(
      { error: { code: "internal_error", message: "Failed to delete Journey." } },
      { status: 500 },
    );
  }
}

function notFound(): Response {
  return Response.json(
    { error: { code: "journey_not_found", message: "Journey not found." } },
    { status: 404 },
  );
}
