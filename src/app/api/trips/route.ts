import { randomUUID } from "node:crypto";

import { InvalidTripInputError } from "@/domain/trip/trip-errors";
import { logger, logEvents } from "@/server/observability/logger";
import { serializeError } from "@/server/observability/serialize-error";
import { tripService } from "@/server/trip/trip-service-instance";

export async function POST(request: Request) {
  const requestId = randomUUID();
  const startedAt = performance.now();

  try {
    const input: unknown = await request.json();
    const trip = await tripService.createTrip(input);
    const durationMs = elapsedMilliseconds(startedAt);

    logger.info(
      {
        event: logEvents.tripCreated,
        requestId,
        tripId: trip.id,
        durationMs,
      },
      "Trip created",
    );

    return Response.json(trip, { status: 201 });
  } catch (error) {
    const durationMs = elapsedMilliseconds(startedAt);

    if (error instanceof SyntaxError) {
      logger.warn(
        {
          event: logEvents.tripCreateFailed,
          requestId,
          durationMs,
          error: serializeError(error),
        },
        "Trip creation request contained invalid JSON",
      );

      return Response.json(
        {
          error: {
            code: "invalid_json",
            message: "Request body must be valid JSON.",
          },
        },
        { status: 400 },
      );
    }

    if (error instanceof InvalidTripInputError) {
      logger.warn(
        {
          event: logEvents.tripCreateFailed,
          requestId,
          durationMs,
          error: serializeError(error),
        },
        "Trip creation input was invalid",
      );

      return Response.json(
        {
          error: {
            code: "invalid_trip_input",
            message: error.message,
            issues: error.issues,
          },
        },
        { status: 400 },
      );
    }

    logger.error(
      {
        event: logEvents.tripCreateFailed,
        requestId,
        durationMs,
        error: serializeError(error),
      },
      "Trip creation failed",
    );

    return Response.json(
      {
        error: {
          code: "internal_error",
          message: "Failed to create Trip.",
        },
      },
      { status: 500 },
    );
  }
}

function elapsedMilliseconds(startedAt: number): number {
  return Math.round((performance.now() - startedAt) * 100) / 100;
}
