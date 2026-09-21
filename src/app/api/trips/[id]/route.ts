import { randomUUID } from "node:crypto";

import { cookies } from "next/headers";

import { TripNotFoundError } from "@/domain/trip/trip-errors";
import { readGuestId } from "@/server/identity/guest-identity";
import { logger, logEvents } from "@/server/observability/logger";
import { serializeError } from "@/server/observability/serialize-error";
import { tripService } from "@/server/trip/trip-service-instance";

type TripRouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(
  _request: Request,
  context: TripRouteContext,
) {
  const requestId = randomUUID();
  const startedAt = performance.now();
  const { id: tripId } = await context.params;

  try {
    const ownerGuestId = readGuestId(await cookies());
    if (!ownerGuestId) {
      throw new TripNotFoundError(tripId);
    }

    const trip = await tripService.getTripById(tripId, ownerGuestId);
    const durationMs = elapsedMilliseconds(startedAt);

    logger.info(
      {
        event: logEvents.tripLoaded,
        requestId,
        tripId,
        durationMs,
      },
      "Trip loaded",
    );

    return Response.json(trip);
  } catch (error) {
    const durationMs = elapsedMilliseconds(startedAt);

    if (error instanceof TripNotFoundError) {
      logger.info(
        {
          event: logEvents.tripNotFound,
          requestId,
          tripId,
          durationMs,
        },
        "Trip not found",
      );

      return Response.json(
        {
          error: {
            code: "trip_not_found",
            message: error.message,
          },
        },
        { status: 404 },
      );
    }

    logger.error(
      {
        event: logEvents.tripLoadFailed,
        requestId,
        tripId,
        durationMs,
        error: serializeError(error),
      },
      "Trip load failed",
    );

    return Response.json(
      {
        error: {
          code: "internal_error",
          message: "Failed to load Trip.",
        },
      },
      { status: 500 },
    );
  }
}

function elapsedMilliseconds(startedAt: number): number {
  return Math.round((performance.now() - startedAt) * 100) / 100;
}
