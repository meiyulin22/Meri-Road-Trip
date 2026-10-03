import { randomUUID } from "node:crypto";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { InvalidTripDraftError } from "@/domain/trip-draft/trip-draft";
import { InvalidTripMessageError } from "@/domain/trip-message/trip-message";
import {
  getOrCreateGuestIdentity,
  guestIdCookieName,
  guestIdCookieOptions,
} from "@/platform/identity/guest-identity";
import { JourneyCreationError } from "@/capabilities/journey/journey-errors";
import { AmapLocationProvider } from "@/platform/location-provider/amap-location-provider";
import { AmapPlacePhotoProvider } from "@/platform/place-photos/amap-place-photo-provider";
import { createJourneyWithOpening } from "@/capabilities/journey/create-journey-with-opening";
import { journeyService } from "@/capabilities/journey/journey-service-instance";
import { LocationService } from "@/capabilities/destination/location-service";
import { logger, logEvents } from "@/platform/observability/logger";
import { serializeError } from "@/platform/observability/serialize-error";
import { openingConversationService } from "@/capabilities/conversation/opening-conversation-service-instance";

function getRequestContext(): { referenceDate: string; timezone: string } {
  const timezone = process.env.MERI_TIMEZONE?.trim() ||
    Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const dateParts = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { referenceDate: `${dateParts.year}-${dateParts.month}-${dateParts.day}`, timezone };
}

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
    const initialUserMessage = "initialUserMessage" in body
      ? body.initialUserMessage
      : undefined;
    if (initialUserMessage !== undefined && typeof initialUserMessage !== "string") {
      throw new InvalidTripMessageError("initialUserMessage must be text.");
    }

    const cookieStore = await cookies();
    const guestIdentity = getOrCreateGuestIdentity(cookieStore);
    const result = await createJourneyWithOpening({
      draft: body.draft,
      ownerGuestId: guestIdentity.guestId,
      initialUserMessage,
      requestId,
      ...getRequestContext(),
    }, {
      createJourney: (draft, ownerGuestId, message, openingAssistant, initialDestination) =>
        journeyService.createJourney(draft, ownerGuestId, message, openingAssistant, initialDestination),
      resolveDestination: (expression) =>
        new LocationService(new AmapLocationProvider()).resolveExpression(expression),
      photos: new AmapPlacePhotoProvider(),
      initializeOpening: (input) => openingConversationService.initialize(input),
    });
    const { journey, opening } = result;
    if (opening === "failed") {
      logger.warn({
        event: logEvents.openingConversationInitializationFailed,
        requestId,
        tripId: journey.trip.id,
        error: serializeError(result.openingError),
      }, "Journey created but opening response failed");
    }
    logger.info(
      {
        event: logEvents.journeyCreated,
        requestId,
        tripId: journey.trip.id,
        durationMs: Math.round(performance.now() - startedAt),
      },
      "Journey created",
    );

    const response = NextResponse.json({ ...journey, opening }, { status: 201 });
    if (guestIdentity.isNew) {
      response.cookies.set(
        guestIdCookieName,
        guestIdentity.guestId,
        guestIdCookieOptions,
      );
    }
    return response;
  } catch (error) {
    const isInvalidInput =
      error instanceof SyntaxError || error instanceof InvalidTripDraftError ||
      error instanceof InvalidTripMessageError;
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
