import { randomUUID } from "node:crypto";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  InvalidTripStateError,
} from "@/domain/trip-state/trip-state";
import { TripNotFoundError } from "@/domain/trip/trip-errors";
import {
  createTripStatePatchFromInterpretation,
  InvalidWorkspaceConversationInterpretationError,
} from "@/domain/trip-state/workspace-conversation";
import {
  LlmProviderRequestError,
  LlmProviderTimeoutError,
  MissingLlmConfigurationError,
} from "@/platform/llm/kimi-client";
import {
  interpretWorkspaceConversation,
  InvalidWorkspaceConversationModelOutputError,
  InvalidWorkspaceConversationRequestError,
} from "@/capabilities/conversation/workspace-conversation-interpreter";
import { selectRecentConversationMessages } from "@/capabilities/conversation/workspace-conversation-context";
import { recommendationScopeForTurn } from "@/capabilities/recommendation/destination-recommendation-use-case";
import { destinationEditReply } from "@/capabilities/conversation/turn-reply";
import { AmapLocationProvider } from "@/platform/location-provider/amap-location-provider";
import { TripStateNotFoundError, TripStateConflictError } from "@/capabilities/journey/journey-errors";
import { journeyService } from "@/capabilities/journey/journey-service-instance";
import { readGuestId } from "@/platform/identity/guest-identity";
import { LocationService } from "@/capabilities/destination/location-service";
import { applyDestinationEdit } from "@/capabilities/destination/apply-destination-edit";
import { resolveDestinationPlace } from "@/capabilities/destination/resolve-destination-place";
import { logger, logEvents } from "@/platform/observability/logger";
import { tripMessageService } from "@/capabilities/conversation/trip-message-service-instance";
import { serializeError } from "@/platform/observability/serialize-error";

type ErrorResponse = {
  status: number;
  message: string;
};

function getRequestContext(): { referenceDate: string; timezone: string } {
  const timezone =
    process.env.MERI_TIMEZONE?.trim() ||
    Intl.DateTimeFormat().resolvedOptions().timeZone ||
    "UTC";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const dateParts = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    referenceDate: `${dateParts.year}-${dateParts.month}-${dateParts.day}`,
    timezone,
  };
}

function mapError(error: unknown): ErrorResponse {
  if (error instanceof TripStateConflictError) {
    return { status: 409, message: "Journey changed while saving. Please refresh and retry." };
  }
  if (
    error instanceof InvalidWorkspaceConversationRequestError ||
    error instanceof InvalidTripStateError
  ) {
    return { status: 400, message: "The workspace message is invalid." };
  }

  if (
    error instanceof TripNotFoundError ||
    error instanceof TripStateNotFoundError
  ) {
    return { status: 404, message: "Journey was not found." };
  }

  if (error instanceof MissingLlmConfigurationError) {
    return { status: 503, message: "Workspace conversation is not configured." };
  }

  if (error instanceof LlmProviderTimeoutError) {
    return { status: 504, message: "Workspace conversation timed out." };
  }

  if (
    error instanceof LlmProviderRequestError ||
    error instanceof InvalidWorkspaceConversationModelOutputError ||
    error instanceof InvalidWorkspaceConversationInterpretationError
  ) {
    return { status: 502, message: "Workspace conversation failed." };
  }

  return { status: 500, message: "An unexpected error occurred." };
}

export async function POST(request: Request) {
  const requestId = randomUUID();
  const startedAt = performance.now();
  const context = {
    requestId,
    method: request.method,
    path: "/api/trip-workspace/messages",
  } as const;

  logger.info(
    { event: logEvents.httpRequestStarted, ...context },
    "HTTP request started",
  );

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new InvalidWorkspaceConversationRequestError(
        "Request body must be valid JSON.",
      );
    }

    if (
      typeof body !== "object" ||
      body === null ||
      !("message" in body) ||
      typeof body.message !== "string" ||
      !("tripId" in body) ||
      typeof body.tripId !== "string" ||
      body.tripId.trim() === ""
    ) {
      throw new InvalidWorkspaceConversationRequestError(
        "Request body must contain message and tripId.",
      );
    }

    const tripId = body.tripId;
    const ownerGuestId = readGuestId(await cookies());
    if (!ownerGuestId) {
      throw new TripNotFoundError(tripId);
    }

    const { tripState } = await journeyService.loadJourney(
      tripId,
      ownerGuestId,
    );
    const previousMessages = await tripMessageService.listMessages(
      tripId,
      ownerGuestId,
    );
    logger.info(
      { event: logEvents.workspaceConversationRequested, ...context },
      "Workspace conversation requested",
    );

    const interpretation = await interpretWorkspaceConversation({
      message: body.message,
      tripState,
      conversationHistory: selectRecentConversationMessages(previousMessages),
      requestId,
      ...getRequestContext(),
    });
    const patch = createTripStatePatchFromInterpretation(interpretation, tripState);
    let persistedTripState = patch
      ? await journeyService.updateTripState(tripId, ownerGuestId, patch)
      : tripState;
    const locationService = new LocationService(new AmapLocationProvider());
    const destinationResult = await applyDestinationEdit(
      persistedTripState.destination,
      interpretation.destinationEdit,
      (expression) => resolveDestinationPlace(expression,
        (query) => locationService.resolveExpression(query)),
      body.message,
    );
    if (destinationResult.changed) {
      persistedTripState = await journeyService.updateTripState(tripId, ownerGuestId,
        { destination: destinationResult.destination }, persistedTripState.destination);
    }
    const persistedPatch = patch || destinationResult.changed
      ? { ...(patch ?? {}), ...(destinationResult.changed ? { destination: destinationResult.destination } : {}) }
      : null;
    // A card or an unplaced name is this turn's question for the user; cards of a
    // second kind beside it would ask two things at once.
    const destinationNeedsUser = destinationResult.choices !== null ||
      destinationResult.unresolved.length > 0 || destinationResult.lookupFailed.length > 0;
    const recommendationScope = destinationNeedsUser
      ? null
      : recommendationScopeForTurn(interpretation, persistedTripState);
    if (recommendationScope === null && interpretation.presentationIntent !== "none") {
      // The model asked for cards on a turn that cannot offer them, so its reply is
      // the whole turn. That is legitimate, but it is also how a weak reply reaches
      // the user, and it is invisible without this line.
      logger.warn({
        event: logEvents.recommendationIntentDeclined, ...context, tripId,
        presentationIntent: interpretation.presentationIntent,
        destinationState: persistedTripState.destination.state,
        destinationOperation: interpretation.destinationEdit.operation,
        destinationNeedsUser,
      }, "Destination recommendations were requested on a turn that cannot offer them");
    }
    const reply = destinationEditReply(destinationResult, interpretation.reply, tripState, persistedTripState);
    const assistantPresentation = destinationResult.choices
      ? destinationResult.choices.presentation
      : recommendationScope
        ? { type: "destination_recommendations_pending" as const, scope: recommendationScope }
        : undefined;
    const finalInterpretation = { ...interpretation, reply };

    if (persistedPatch !== null) {
      logger.info(
        {
          event: logEvents.tripStateUpdateApplied,
          ...context,
          tripId,
          changedFields: Object.keys(persistedPatch),
        },
        "TripState update applied",
      );
    }

    const messages = await tripMessageService.persistSuccessfulTurn({
      tripId,
      ownerGuestId,
      userContent: body.message,
      assistantContent: finalInterpretation.reply,
      ...(assistantPresentation ? { assistantPresentation } : {}),
    });
    logger.info(
      {
        event: logEvents.tripMessageTurnPersisted,
        ...context,
        tripId,
        branch: destinationResult.choices ? "destination_choices"
          : recommendationScope ? `destination_recommendations_${recommendationScope}` : "conversation",
        messageIds: messages.map((message) => message.id),
      },
      "Trip conversation turn persisted",
    );

    logger.info(
      {
        event: logEvents.httpRequestCompleted,
        ...context,
        durationMs: Math.round(performance.now() - startedAt),
        statusCode: 200,
      },
      "HTTP request completed",
    );

    return NextResponse.json({
      interpretation: finalInterpretation,
      tripState: persistedTripState,
      messages,
    });
  } catch (error) {
    const response = mapError(error);
    logger.error(
      {
        event: logEvents.httpRequestFailed,
        ...context,
        durationMs: Math.round(performance.now() - startedAt),
        statusCode: response.status,
        error: serializeError(error),
      },
      "HTTP request failed",
    );

    return NextResponse.json(
      { error: response.message, requestId },
      { status: response.status },
    );
  }
}
