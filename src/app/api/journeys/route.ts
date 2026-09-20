import { randomUUID } from "node:crypto";

import { InvalidTripDraftError } from "@/domain/trip-draft/trip-draft";
import { JourneyCreationError } from "@/server/journey/journey-errors";
import { journeyService } from "@/server/journey/journey-service-instance";
import { logger, logEvents } from "@/server/observability/logger";
import { serializeError } from "@/server/observability/serialize-error";

export async function POST(request: Request) {
  const requestId = randomUUID();
  const startedAt = performance.now();

  try {
    const body: unknown = await request.json();
    if (
      typeof body !== "object" ||
      body === null ||
      !("draft" in body)
    ) {
      throw new InvalidTripDraftError("Request body must contain a draft.");
    }

    const journey = await journeyService.createJourney(body.draft);
    logger.info(
      {
        event: logEvents.journeyCreated,
        requestId,
        tripId: journey.trip.id,
        durationMs: Math.round(performance.now() - startedAt),
      },
      "Journey created",
    );

    return Response.json(journey, { status: 201 });
  } catch (error) {
    const isInvalidInput =
      error instanceof SyntaxError || error instanceof InvalidTripDraftError;
    const status = isInvalidInput ? 400 : 500;

    logger.error(
      {
        event: logEvents.journeyCreateFailed,
        requestId,
        durationMs: Math.round(performance.now() - startedAt),
        error: serializeError(error),
      },
      "Journey creation failed",
    );

    return Response.json(
      {
        error: {
          code: isInvalidInput
            ? "invalid_journey_input"
            : error instanceof JourneyCreationError
              ? "journey_persistence_failed"
              : "internal_error",
          message: isInvalidInput
            ? "Journey input is invalid."
            : "Failed to create Journey.",
        },
      },
      { status },
    );
  }
}
