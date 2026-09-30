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
import { destinationRecommendationDependencies, persistConversationalRecommendationTurn } from "@/capabilities/recommendation/destination-recommendation-use-case";
import { InvalidDestinationRecommendationOutputError } from "@/capabilities/recommendation/destination-recommendation-generator";
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
    error instanceof InvalidWorkspaceConversationInterpretationError ||
    error instanceof InvalidDestinationRecommendationOutputError
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
    const patch = createTripStatePatchFromInterpretation(interpretation);
    let persistedTripState = patch
      ? await journeyService.updateTripState(tripId, ownerGuestId, patch)
      : tripState;
    const locationService = new LocationService(new AmapLocationProvider());
    const destinationResult = await applyDestinationEdit(
      persistedTripState.destination,
      interpretation.destinationEdit,
      (expression) => resolveDestinationPlace(expression,
        (query) => locationService.resolveExpression(query)),
    );
    if (destinationResult.changed) {
      persistedTripState = await journeyService.updateTripState(tripId, ownerGuestId,
        { destination: destinationResult.destination }, persistedTripState.destination);
    }
    const persistedPatch = patch ?? (destinationResult.changed
      ? { destination: destinationResult.destination } : null);
    const recommendationMessages = destinationResult.choices || interpretation.destinationEdit.operation !== "none"
      ? null
      : await persistConversationalRecommendationTurn({
        tripId, ownerGuestId, tripState: persistedTripState, interpretation, patch, persistedPatch,
        previousMessages, currentUserText: body.message, requestId,
      }, {
        ...destinationRecommendationDependencies(),
        persistTurn: (input) => tripMessageService.persistSuccessfulTurn(input),
      });
    const reply = destinationResult.choices
      ? `找到「${destinationResult.choices.answering}」相关的地点了。点击添加后才会记入旅程。${
          destinationResult.unresolved.length ? `「${destinationResult.unresolved.join("、")}」暂时没找到。` : ""}${
          destinationResult.lookupFailed.length ? `「${destinationResult.lookupFailed.join("、")}」查询暂时不可用。` : ""}`
      : destinationResult.ambiguousRemovals.length
        ? `${destinationResult.changed ? "已移除能确认的地点。" : ""}「${destinationResult.ambiguousRemovals.join("、")}」对应多个已保存地点，请说得更具体一些。`
        : destinationResult.notInDestination.length
          ? `${destinationResult.changed ? "已移除能确认的地点。" : ""}当前旅程里没有找到「${destinationResult.notInDestination.join("、")}」。`
      : destinationResult.lookupFailed.length
        ? "地点查询暂时不可用，目的地没有改变。请稍后重试。"
        : destinationResult.unresolved.length
          ? `暂时没找到「${destinationResult.unresolved.join("、")}」的可靠地点，目的地没有因此改变。`
          : interpretation.reply;
    const finalInterpretation = { ...interpretation, reply: recommendationMessages?.[1].content ?? reply };

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

    const messages = recommendationMessages ?? await tripMessageService.persistSuccessfulTurn({
      tripId,
      ownerGuestId,
      userContent: body.message,
      assistantContent: finalInterpretation.reply,
      ...(destinationResult.choices ? { assistantPresentation: destinationResult.choices.presentation } : {}),
    });
    logger.info(
      {
        event: logEvents.tripMessageTurnPersisted,
        ...context,
        tripId,
        branch: destinationResult.choices ? "destination_choices" : recommendationMessages ? "destination_recommendations" : "conversation",
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
