import { randomUUID } from "node:crypto";

import { cookies } from "next/headers";

import {
  InvalidTripStateError,
  validateTripStatePatch,
} from "@/domain/trip-state/trip-state";
import { TripNotFoundError } from "@/domain/trip/trip-errors";
import { readGuestId } from "@/server/identity/guest-identity";
import { TripStateNotFoundError } from "@/server/journey/journey-errors";
import { journeyService } from "@/server/journey/journey-service-instance";
import { logger, logEvents } from "@/server/observability/logger";
import { serializeError } from "@/server/observability/serialize-error";

type TripStateRouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: TripStateRouteContext) {
  const { id: tripId } = await context.params;

  try {
    const ownerGuestId = await requireOwnerGuestId(tripId);
    const journey = await journeyService.loadJourney(tripId, ownerGuestId);
    return Response.json({ tripState: journey.tripState });
  } catch (error) {
    return stateErrorResponse(error, tripId, randomUUID());
  }
}

export async function PATCH(request: Request, context: TripStateRouteContext) {
  const requestId = randomUUID();
  const { id: tripId } = await context.params;

  try {
    const body: unknown = await request.json();
    if (
      typeof body !== "object" ||
      body === null ||
      !("patch" in body)
    ) {
      throw new InvalidTripStateError("Request body must contain a patch.");
    }

    const ownerGuestId = await requireOwnerGuestId(tripId);
    const patch = validateTripStatePatch(body.patch);
    const tripState = await journeyService.updateTripState(
      tripId,
      ownerGuestId,
      patch,
    );
    logger.info(
      {
        event: logEvents.tripStateUpdateApplied,
        requestId,
        tripId,
        changedFields: Object.keys(patch),
      },
      "TripState update applied",
    );
    return Response.json({ tripState });
  } catch (error) {
    return stateErrorResponse(error, tripId, requestId);
  }
}

async function requireOwnerGuestId(tripId: string): Promise<string> {
  const guestId = readGuestId(await cookies());

  if (!guestId) {
    throw new TripNotFoundError(tripId);
  }

  return guestId;
}

function stateErrorResponse(
  error: unknown,
  tripId: string,
  requestId: string,
): Response {
  const isMissing =
    error instanceof TripNotFoundError || error instanceof TripStateNotFoundError;
  const status = error instanceof InvalidTripStateError ? 400 : isMissing ? 404 : 500;

  logger.error(
    {
      event: logEvents.tripStatePersistenceFailed,
      requestId,
      tripId,
      error: serializeError(error),
    },
    "TripState persistence request failed",
  );

  return Response.json(
    {
      error: {
        code:
          error instanceof InvalidTripStateError
            ? "invalid_trip_state_patch"
            : error instanceof TripNotFoundError
              ? "trip_not_found"
              : error instanceof TripStateNotFoundError
                ? "trip_state_not_found"
                : "internal_error",
        message:
          status === 404
            ? "Journey was not found."
            : status === 400
              ? "TripState patch is invalid."
              : "Failed to persist TripState.",
      },
    },
    { status },
  );
}
