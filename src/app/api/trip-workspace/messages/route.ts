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
import { TripStateNotFoundError } from "@/capabilities/journey/journey-errors";
import { journeyService } from "@/capabilities/journey/journey-service-instance";
import { readGuestId } from "@/platform/identity/guest-identity";
import { LocationService } from "@/capabilities/destination/location-service";
import { persistWorkspacePatchWithDisambiguation } from "@/capabilities/destination/post-update-destination-resolution";
import { narrowingPresentation } from "@/capabilities/destination/verify-destination-disambiguation";
import { resolveWorkspaceTurn } from "@/capabilities/conversation/workspace-turn-branch";
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
    const locationService = new LocationService(new AmapLocationProvider());
    const disambiguation = interpretation.destinationDisambiguation;
    const { tripState: persistedTripState, resolution, persistedPatch, disambiguationResult } =
      await persistWorkspacePatchWithDisambiguation(
        tripState,
        patch,
        disambiguation,
        (committedPatch) => journeyService.updateTripState(tripId, ownerGuestId, committedPatch),
        locationService,
      );
    const destinationExpression = patch?.destination?.state !== "missing"
      ? patch?.destination?.value : null;
    const recommendationMessages = await persistConversationalRecommendationTurn({
      tripId, ownerGuestId, tripState: persistedTripState, interpretation, patch, persistedPatch,
      previousMessages, currentUserText: body.message, requestId,
    }, {
      ...destinationRecommendationDependencies(),
      persistTurn: (input) => tripMessageService.persistSuccessfulTurn(input),
    });
    const turn = resolveWorkspaceTurn({
      interpretation,
      recommendationReply: recommendationMessages?.[1].content ?? null,
      disambiguationResult,
      destinationExpression: destinationExpression ?? null,
      tripState: persistedTripState,
      resolution,
      persistedPatch,
    });
    const finalInterpretation = { ...interpretation, reply: turn.reply };

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
      // Narrowing a broad expression offers 市 to pick several of; a provider that
      // found one expression ambiguous is still asking which single place was meant.
      ...(disambiguationResult?.status === "verified"
        ? { assistantPresentation: narrowingPresentation(disambiguationResult,
          persistedTripState.destination.state === "known" ? persistedTripState.destination.areas : undefined) }
        : resolution?.status === "ambiguous"
          ? { assistantPresentation: { type: "location_candidates" as const, candidates: resolution.candidates } }
          : {}),
    });
    logger.info(
      {
        event: logEvents.tripMessageTurnPersisted,
        ...context,
        tripId,
        branch: turn.branch,
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
