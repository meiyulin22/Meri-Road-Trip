import { randomUUID } from "node:crypto";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { TripNotFoundError } from "@/domain/trip/trip-errors";
import {
  InvalidWorkspaceConversationModelOutputError,
} from "@/server/ai/workspace-conversation-interpreter";
import {
  LlmProviderRequestError,
  LlmProviderTimeoutError,
  MissingLlmConfigurationError,
} from "@/server/ai/kimi-client";
import { readGuestId } from "@/server/identity/guest-identity";
import { TripStateNotFoundError } from "@/server/journey/journey-errors";
import { logger, logEvents } from "@/server/observability/logger";
import { serializeError } from "@/server/observability/serialize-error";
import { OpeningConversationNotEligibleError } from "@/server/trip-message/opening-conversation-service";
import { openingConversationService } from "@/server/trip-message/opening-conversation-service-instance";

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

export async function POST(
  _request: Request,
  { params }: { readonly params: Promise<{ id: string }> },
) {
  const requestId = randomUUID();
  const { id: tripId } = await params;
  const ownerGuestId = readGuestId(await cookies());
  if (!ownerGuestId) {
    return NextResponse.json({ error: "Journey was not found." }, { status: 404 });
  }

  try {
    const message = await openingConversationService.initialize({
      tripId,
      ownerGuestId,
      requestId,
      ...getRequestContext(),
    });
    return NextResponse.json({ message });
  } catch (error) {
    const status = error instanceof TripNotFoundError || error instanceof TripStateNotFoundError
      ? 404
      : error instanceof OpeningConversationNotEligibleError
        ? 409
        : error instanceof MissingLlmConfigurationError
          ? 503
          : error instanceof LlmProviderTimeoutError
            ? 504
            : error instanceof LlmProviderRequestError ||
              error instanceof InvalidWorkspaceConversationModelOutputError
              ? 502
              : 500;
    logger.error({
      event: logEvents.openingConversationInitializationFailed,
      requestId,
      tripId,
      statusCode: status,
      error: serializeError(error),
    }, "Opening conversation initialization failed");
    return NextResponse.json({ error: status === 409
      ? "Opening conversation is not pending."
      : status === 404 ? "Journey was not found." : "Meri could not finish the opening response. Please retry." },
    { status });
  }
}
