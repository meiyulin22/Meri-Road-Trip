import { randomUUID } from "node:crypto";

import { cookies } from "next/headers";

import { validateTripMessage, type TripMessage } from "@/domain/trip-message/trip-message";
import type { TripState } from "@/domain/trip-state/trip-state";
import { validateTripUserAction, type TripUserAction } from "@/domain/trip-user-action/trip-user-action";
import { TripNotFoundError } from "@/domain/trip/trip-errors";
import { buildDestinationRecommendationContext, type DestinationRecommendationContext } from "@/server/ai/destination-recommendation-context";
import { generateDestinationRecommendations, InvalidDestinationRecommendationOutputError, type DestinationRecommendations } from "@/server/ai/destination-recommendation-generator";
import { LlmProviderRequestError, LlmProviderTimeoutError, MissingLlmConfigurationError } from "@/server/ai/kimi-client";
import { readGuestId } from "@/server/identity/guest-identity";
import { TripStateNotFoundError } from "@/server/journey/journey-errors";
import { DestinationRecommendationEnricher, type RecommendationEnrichment } from "@/server/location/destination-recommendation-enrichment";
import { logger } from "@/server/observability/logger";
import { serializeError } from "@/server/observability/serialize-error";

type Dependencies = {
  readonly loadJourney: (tripId: string, ownerGuestId: string) => Promise<{ tripState: TripState }>;
  readonly listMessages: (tripId: string, ownerGuestId: string) => Promise<TripMessage[]>;
  readonly persistAction: (action: TripUserAction) => Promise<TripUserAction>;
  readonly generate: (context: DestinationRecommendationContext, requestId: string) => Promise<DestinationRecommendations>;
  readonly enrich: (recommendation: DestinationRecommendations["destinations"][number]) => Promise<RecommendationEnrichment>;
  readonly persistMessage: (message: TripMessage) => Promise<void>;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function response(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function handleDestinationRecommendationsPost(
  tripId: string,
  ownerGuestId: string | null,
  dependencies: Dependencies,
  requestId: string = randomUUID(),
): Promise<Response> {
  if (!ownerGuestId || !uuidPattern.test(tripId)) {
    return response({ error: { code: "journey_not_found", message: "Journey not found." } }, 404);
  }
  try {
    const { tripState } = await dependencies.loadJourney(tripId, ownerGuestId);
    if (tripState.destination.state !== "missing") {
      return response({ error: { code: "destination_not_missing", message: "Destination is no longer missing." } }, 409);
    }
    const action = validateTripUserAction(await dependencies.persistAction({
      id: randomUUID(),
      tripId,
      type: "request_destination_recommendations",
      createdAt: new Date().toISOString(),
    }));
    if (action.tripId !== tripId) throw new Error("Persisted action belongs to another Journey.");
    const messages = await dependencies.listMessages(tripId, ownerGuestId);
    const context = buildDestinationRecommendationContext(action, tripState, messages);
    const recommendations = await dependencies.generate(context, requestId);
    const enrichments = await Promise.all(recommendations.destinations.map(async (recommendation) => {
      try {
        return await dependencies.enrich(recommendation);
      } catch {
        logger.warn({ requestId, tripId, event: "destination.recommendation.enrichment_failed" },
          "Destination enrichment unavailable");
        return { matched: false, imageUrl: null };
      }
    }));
    logger.info({ requestId, tripId, event: "destination.recommendation.enriched",
      matchedCount: enrichments.filter((item) => item.matched).length,
      photoCount: enrichments.filter((item) => item.imageUrl !== null).length },
    "Destination recommendation enrichment completed");
    const message = validateTripMessage({
      id: randomUUID(), tripId, role: "assistant", content: recommendations.reply,
      createdAt: new Date().toISOString(),
      presentation: {
        type: "destination_recommendations",
        destinations: recommendations.destinations.map((item) => ({
          id: randomUUID(), name: item.name, region: item.region, reason: item.reason,
          // Amap terms do not clearly permit storing and replaying photo URLs in Journey messages.
          imageUrl: null,
        })),
      },
    });
    await dependencies.persistMessage(message);
    return response({ message }, 200);
  } catch (error) {
    const status = error instanceof TripNotFoundError || error instanceof TripStateNotFoundError
      ? 404
      : error instanceof MissingLlmConfigurationError
        ? 503
        : error instanceof LlmProviderTimeoutError
          ? 504
          : error instanceof LlmProviderRequestError || error instanceof InvalidDestinationRecommendationOutputError
            ? 502
            : 500;
    logger.error({ requestId, tripId, statusCode: status, error: serializeError(error) },
      "Destination recommendation request failed");
    return response({ error: {
      code: status === 404 ? "journey_not_found" : status === 503 ? "model_not_configured" :
        status === 504 ? "model_timeout" : status === 502 ? "recommendation_failed" : "internal_error",
      message: status === 404 ? "Journey not found." : "Destination recommendations are unavailable.",
    } }, status);
  }
}

export async function POST(_request: Request, { params }: { readonly params: Promise<{ id: string }> }): Promise<Response> {
  const { id: tripId } = await params;
  const ownerGuestId = readGuestId(await cookies());
  if (!ownerGuestId || !uuidPattern.test(tripId)) {
    return response({ error: { code: "journey_not_found", message: "Journey not found." } }, 404);
  }
  const [{ journeyService }, { tripMessageService }, { db }, { PostgresTripUserActionRepository }, { PostgresTripMessageRepository }] = await Promise.all([
    import("@/server/journey/journey-service-instance"),
    import("@/server/trip-message/trip-message-service-instance"),
    import("@/server/database/db"),
    import("@/infrastructure/persistence/postgres/postgres-trip-user-action-repository"),
    import("@/infrastructure/persistence/postgres/postgres-trip-message-repository"),
  ]);
  const actionRepository = new PostgresTripUserActionRepository(db);
  const messageRepository = new PostgresTripMessageRepository(db);
  const enricher = new DestinationRecommendationEnricher();
  return handleDestinationRecommendationsPost(tripId, ownerGuestId, {
    loadJourney: (id, owner) => journeyService.loadJourney(id, owner),
    listMessages: (id, owner) => tripMessageService.listMessages(id, owner),
    persistAction: (action) => actionRepository.create(action),
    generate: generateDestinationRecommendations,
    enrich: (recommendation) => enricher.enrich(recommendation),
    persistMessage: (message) => messageRepository.createMessage(message),
  });
}
