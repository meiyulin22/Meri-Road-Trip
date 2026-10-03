import { randomUUID } from "node:crypto";

import { cookies } from "next/headers";

import type { TripMessage, TripMessagePresentation } from "@/domain/trip-message/trip-message";
import type { TripState } from "@/domain/trip-state/trip-state";
import { TripNotFoundError } from "@/domain/trip/trip-errors";
import { readGuestId } from "@/platform/identity/guest-identity";
import { logEvents, logger } from "@/platform/observability/logger";
import { serializeError } from "@/platform/observability/serialize-error";
import { TripStateNotFoundError } from "@/capabilities/journey/journey-errors";
import { destinationRecommendationCardsMessageId } from "@/capabilities/conversation/destination-selection-message-id";
import {
  createPendingRecommendations,
  destinationRecommendationDependencies,
  pendingRecommendationRequest,
  type DestinationRecommendationUseCaseDependencies,
} from "@/capabilities/recommendation/destination-recommendation-use-case";

type Dependencies = DestinationRecommendationUseCaseDependencies & {
  readonly loadJourney: (tripId: string, ownerGuestId: string) => Promise<{ tripState: TripState }>;
  readonly listMessages: (tripId: string, ownerGuestId: string) => Promise<TripMessage[]>;
  readonly persistCards: (input: {
    tripId: string; ownerGuestId: string; messageId: string; content: string;
    presentation?: TripMessagePresentation;
  }) => Promise<TripMessage>;
};

/**
 * The second half of a recommendation turn: the reply is already on screen, and this
 * chooses the cards it promised. Only a reply that is still the latest message may
 * get cards — once the user has said something else, a list arriving under it would
 * answer a question they have moved past.
 */
export async function handleDestinationRecommendationsPost(
  tripId: string,
  ownerGuestId: string | null,
  body: unknown,
  requestId: string,
  dependencies: Dependencies,
): Promise<Response> {
  if (!ownerGuestId) return Response.json({ error: "Journey not found." }, { status: 404 });
  if (typeof body !== "object" || body === null || Array.isArray(body) || Object.keys(body).length !== 1 ||
    !("messageId" in body) || typeof body.messageId !== "string" || !body.messageId.trim()) {
    return Response.json({ error: "Invalid recommendation request." }, { status: 400 });
  }
  const pendingMessageId = body.messageId;
  try {
    const { tripState } = await dependencies.loadJourney(tripId, ownerGuestId);
    const messages = await dependencies.listMessages(tripId, ownerGuestId);
    const cardsMessageId = destinationRecommendationCardsMessageId(tripId, pendingMessageId);
    const existing = messages.find((message) => message.id === cardsMessageId);
    if (existing) return Response.json({ assistantMessage: existing });

    const request = pendingRecommendationRequest(messages, pendingMessageId);
    if (request.status === "not_found") {
      return Response.json({ error: "Recommendation request not found." }, { status: 404 });
    }
    if (messages.at(-1)?.id !== pendingMessageId) {
      return Response.json({ error: "The conversation has moved on.", code: "recommendations_stale" }, { status: 409 });
    }
    const result = await createPendingRecommendations({ tripId, tripState, request, requestId }, dependencies);
    if (result === null) {
      return Response.json({ error: "The destination changed since this request.", code: "recommendations_stale" },
        { status: 409 });
    }
    const assistantMessage = await dependencies.persistCards({
      tripId, ownerGuestId, messageId: cardsMessageId, content: result.content,
      ...(result.presentation ? { presentation: result.presentation } : {}),
    });
    return Response.json({ assistantMessage });
  } catch (error) {
    const missing = error instanceof TripNotFoundError || error instanceof TripStateNotFoundError;
    if (!missing) {
      logger.error({ event: logEvents.recommendationCardsFailed, requestId, tripId, error: serializeError(error) },
        "Destination recommendation cards failed");
    }
    return Response.json({ error: missing ? "Journey not found." : "Recommendations are unavailable." },
      { status: missing ? 404 : 502 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  let body: unknown;
  try { body = await request.json(); }
  catch { return Response.json({ error: "Invalid recommendation request." }, { status: 400 }); }
  const { journeyService } = await import("@/capabilities/journey/journey-service-instance");
  const { tripMessageService } = await import("@/capabilities/conversation/trip-message-service-instance");
  return handleDestinationRecommendationsPost(id, readGuestId(await cookies()), body, randomUUID(), {
    ...destinationRecommendationDependencies(),
    loadJourney: (tripId, owner) => journeyService.loadJourney(tripId, owner),
    listMessages: (tripId, owner) => tripMessageService.listMessages(tripId, owner),
    persistCards: (input) => tripMessageService.persistRecommendationCards(input),
  });
}
