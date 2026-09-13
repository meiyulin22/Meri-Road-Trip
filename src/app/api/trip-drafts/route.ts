import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { InvalidTripDraftError } from "@/domain/trip-draft/trip-draft";
import {
  LlmProviderRequestError,
  LlmProviderTimeoutError,
  MissingLlmConfigurationError,
} from "@/server/ai/kimi-client";
import {
  extractTripDraft,
  InvalidModelOutputError,
  InvalidTripDraftRequestError,
} from "@/server/ai/trip-draft-extractor";
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
  if (error instanceof InvalidTripDraftRequestError) {
    return { status: 400, message: error.message };
  }

  if (error instanceof MissingLlmConfigurationError) {
    return { status: 503, message: "Trip draft extraction is not configured." };
  }

  if (error instanceof LlmProviderTimeoutError) {
    return { status: 504, message: "Trip draft extraction timed out." };
  }

  if (
    error instanceof LlmProviderRequestError ||
    error instanceof InvalidModelOutputError ||
    error instanceof InvalidTripDraftError
  ) {
    return { status: 502, message: "Trip draft extraction failed." };
  }

  return { status: 500, message: "An unexpected error occurred." };
}

export async function POST(request: Request) {
  const requestId = randomUUID();
  const startedAt = performance.now();
  const context = {
    requestId,
    method: request.method,
    path: "/api/trip-drafts",
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
      throw new InvalidTripDraftRequestError("Request body must be valid JSON.");
    }

    if (
      typeof body !== "object" ||
      body === null ||
      !("message" in body) ||
      typeof body.message !== "string"
    ) {
      throw new InvalidTripDraftRequestError(
        "Request body must contain a string message.",
      );
    }

    const draft = await extractTripDraft({
      message: body.message,
      requestId,
      ...getRequestContext(),
    });
    const durationMs = Math.round(performance.now() - startedAt);

    logger.info(
      {
        event: logEvents.httpRequestCompleted,
        ...context,
        durationMs,
        statusCode: 200,
      },
      "HTTP request completed",
    );

    return NextResponse.json({ draft });
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
