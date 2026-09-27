import { randomUUID } from "node:crypto";

import type { DestinationRecommendationPresentation, TripMessage } from "@/domain/trip-message/trip-message";
import type { TripState, TripStatePatch } from "@/domain/trip-state/trip-state";
import type { WorkspaceConversationInterpretation } from "@/domain/trip-state/workspace-conversation";
import { DestinationRecommendationEnricher, type RecommendationEnrichment } from "@/server/location/destination-recommendation-enrichment";
import { logger } from "@/server/observability/logger";
import type { TripMessageService } from "@/server/trip-message/trip-message-service";
import { buildConversationalDestinationRecommendationContext, type DestinationRecommendationContext } from "./destination-recommendation-context";
import { generateDestinationRecommendations, type DestinationRecommendations } from "./destination-recommendation-generator";

export interface DestinationRecommendationUseCaseDependencies {
  readonly generate: (context: DestinationRecommendationContext, requestId: string) => Promise<DestinationRecommendations>;
  readonly enrich: (recommendation: DestinationRecommendations["destinations"][number]) => Promise<RecommendationEnrichment>;
}

export function shouldCreateConversationalRecommendations(
  interpretation: WorkspaceConversationInterpretation,
  authoritativeState: TripState,
  patch: TripStatePatch | null,
): boolean {
  return interpretation.presentationIntent === "destination_recommendations" &&
    authoritativeState.destination.state === "missing" &&
    !patch?.destination &&
    interpretation.destinationDisambiguation?.state !== "known";
}

export async function createDestinationRecommendationReply(
  context: DestinationRecommendationContext,
  requestId: string,
  dependencies: DestinationRecommendationUseCaseDependencies,
): Promise<{ readonly content: string; readonly presentation: DestinationRecommendationPresentation }> {
  const recommendations = await dependencies.generate(context, requestId);
  const enrichments = await Promise.all(recommendations.destinations.map(async (recommendation) => {
    try {
      return await dependencies.enrich(recommendation);
    } catch {
      logger.warn({ requestId, event: "destination.recommendation.enrichment_failed" },
        "Destination enrichment unavailable");
      return { matched: false, imageUrl: null };
    }
  }));
  logger.info({ requestId, event: "destination.recommendation.enriched",
    matchedCount: enrichments.filter((item) => item.matched).length,
    photoCount: enrichments.filter((item) => item.imageUrl !== null).length },
  "Destination recommendation enrichment completed");
  return {
    content: recommendations.reply,
    presentation: {
      type: "destination_recommendations",
      destinations: recommendations.destinations.map((item, index) => ({
        id: randomUUID(), name: item.name, region: item.region, reason: item.reason,
        imageUrl: enrichments[index]?.imageUrl ?? null,
      })),
    },
  };
}

export function destinationRecommendationDependencies(): DestinationRecommendationUseCaseDependencies {
  const enricher = new DestinationRecommendationEnricher();
  return { generate: generateDestinationRecommendations,
    enrich: (recommendation) => enricher.enrich(recommendation) };
}

export async function persistConversationalRecommendationTurn(input: {
  readonly tripId: string;
  readonly ownerGuestId: string;
  readonly tripState: TripState;
  readonly interpretation: WorkspaceConversationInterpretation;
  readonly patch: TripStatePatch | null;
  readonly previousMessages: readonly TripMessage[];
  readonly currentUserText: string;
  readonly requestId: string;
}, dependencies: DestinationRecommendationUseCaseDependencies & {
  readonly persistTurn: Pick<TripMessageService, "persistSuccessfulTurn">["persistSuccessfulTurn"];
}): Promise<readonly [TripMessage, TripMessage] | null> {
  if (!shouldCreateConversationalRecommendations(input.interpretation, input.tripState, input.patch)) {
    return null;
  }
  const context = buildConversationalDestinationRecommendationContext(
    input.tripId, input.tripState, input.previousMessages, input.currentUserText);
  const reply = await createDestinationRecommendationReply(context, input.requestId, dependencies);
  return dependencies.persistTurn({
    tripId: input.tripId,
    ownerGuestId: input.ownerGuestId,
    userContent: input.currentUserText,
    assistantContent: reply.content,
    assistantPresentation: reply.presentation,
  });
}
