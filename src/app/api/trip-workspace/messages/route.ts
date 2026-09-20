import { randomUUID } from "node:crypto";

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
} from "@/server/ai/kimi-client";
import {
  interpretWorkspaceConversation,
  InvalidWorkspaceConversationModelOutputError,
  InvalidWorkspaceConversationRequestError,
} from "@/server/ai/workspace-conversation-interpreter";
import { TripStateNotFoundError } from "@/server/journey/journey-errors";
import { journeyService } from "@/server/journey/journey-service-instance";
import { logger, logEvents } from "@/server/observability/logger";
import { serializeError } from "@/server/observability/serialize-error";

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
    const { tripState } = await journeyService.loadJourney(tripId);
    logger.info(
      { event: logEvents.workspaceConversationRequested, ...context },
      "Workspace conversation requested",
    );

    const interpretation = await interpretWorkspaceConversation({
      message: body.message,
      tripState,
      requestId,
      ...getRequestContext(),
    });
    const patch = createTripStatePatchFromInterpretation(interpretation);
    let persistedTripState = tripState;

    if (patch !== null) {
      persistedTripState = await journeyService.updateTripState(tripId, patch);
      logger.info(
        {
          event: logEvents.tripStateUpdateApplied,
          ...context,
          tripId,
          changedFields: Object.keys(patch),
        },
        "TripState update applied",
      );
    }

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
      interpretation,
      tripState: persistedTripState,
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
