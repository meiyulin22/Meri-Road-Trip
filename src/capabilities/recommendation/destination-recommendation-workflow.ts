import { randomUUID } from "node:crypto";

import type { DestinationRecommendationGroup } from "@/domain/location/destination-recommendations";
import { normalizeRecommendationRegion } from "@/domain/location/recommendation-identity";
import type { DestinationArea } from "@/domain/trip-state/destination-areas";
import type { DestinationRecommendationPresentation } from "@/domain/trip-message/trip-message";
import { createBochaDiscoverySearchFromEnvironment } from "@/platform/search/bocha-discovery-search";
import { searchJourneyDiscovery, type DiscoverySearch, type DiscoverySearchResult } from "@/platform/search/discovery-search";
import { logger } from "@/platform/observability/logger";
import { generateDestinationRecommendations } from "./destination-recommendation-generator";
import { meriReplies } from "@/capabilities/conversation/meri-replies";
import type { DestinationRecommendationContext } from "./destination-recommendation-context";

export type DestinationRecommendationWorkflowResult = {
  readonly content: string;
  readonly presentation?: DestinationRecommendationPresentation;
};

export type DestinationRecommendationWorkflowDependencies = {
  readonly discovery: DiscoverySearch;
  readonly generate: (context: DestinationRecommendationContext & {
    readonly discoveryResults?: readonly DiscoverySearchResult[];
  }, requestId: string) => Promise<readonly DestinationRecommendationGroup[]>;
  readonly generateId: () => string;
};

export function destinationRecommendationWorkflowDependencies(): DestinationRecommendationWorkflowDependencies {
  return {
    discovery: createBochaDiscoverySearchFromEnvironment(),
    generate: generateDestinationRecommendations,
    generateId: randomUUID,
  };
}

export async function runDestinationRecommendationWorkflow(
  context: DestinationRecommendationContext,
  requestId: string,
  dependencies: DestinationRecommendationWorkflowDependencies = destinationRecommendationWorkflowDependencies(),
): Promise<DestinationRecommendationWorkflowResult> {
  const startedAt = performance.now();
  logger.info({ event: "recommendation.workflow.started", requestId, source: context.source, scope: context.scope },
    "Destination recommendation workflow started");

  const discovery = await searchJourneyDiscovery(context, dependencies.discovery);
  const proposed = await dependencies.generate(
    discovery.length ? { ...context, discoveryResults: discovery } : context, requestId);
  const groups = context.scope === "elsewhere"
    ? outsideSavedProvinces(proposed, settledAreas(context))
    : withinSettledProvinces(proposed, settledAreas(context));
  // Cards are shown before their photos: each keeps its landmark, and the browser asks
  // for the photos once the cards are on screen (recommendation-photos.ts).
  const destinations = groups.flatMap((group) => group.places.map((place) => ({
    id: dependencies.generateId(), name: place.name, province: group.province, reason: place.reason,
    ...(place.landmark ? { landmark: place.landmark } : {}),
  })));

  logger.info({ event: "recommendation.workflow.completed", requestId,
    discoveryCount: discovery.length, proposedProvinceCount: proposed.length,
    provinceCount: groups.length, placeCount: destinations.length,
    durationMs: Math.round(performance.now() - startedAt) }, "Destination recommendation workflow completed");

  const replies = meriReplies[context.locale];
  if (!destinations.length) {
    return { content: context.scope === "elsewhere" ? replies.noRecommendationsElsewhere : replies.noRecommendations };
  }
  return {
    content: replies.recommendationsListed,
    presentation: { type: "destination_recommendations", destinations },
  };
}

function settledAreas(context: DestinationRecommendationContext): readonly DestinationArea[] | undefined {
  return context.tripState.destination.state === "missing" ? undefined : context.tripState.destination.areas;
}

/**
 * The provinces the user has already settled are the strongest thing they have said,
 * so a place outside them is not a recommendation but a change of subject: 「我想去海南」
 * followed by a 西藏 card ignores the one answer we were given. The settled spelling
 * wins over the model's, so that picking a place adds it to the area the destination
 * already carries instead of opening a second province beside it.
 */
/**
 * Widening a trip means places it does not have yet. A province already saved is
 * dropped even if the model proposes it, because a card there would quietly turn
 * 「别的省份」 back into more of the same.
 */
function outsideSavedProvinces(
  groups: readonly DestinationRecommendationGroup[],
  saved: readonly DestinationArea[] | undefined,
): readonly DestinationRecommendationGroup[] {
  const provinces = new Set((saved ?? []).map((area) => normalizeRecommendationRegion(area.province)));
  return groups.filter((group) => !provinces.has(normalizeRecommendationRegion(group.province)));
}

function withinSettledProvinces(
  groups: readonly DestinationRecommendationGroup[],
  settled: readonly DestinationArea[] | undefined,
): readonly DestinationRecommendationGroup[] {
  if (!settled?.length) return groups;
  const provinces = new Map(settled.map((area) => [normalizeRecommendationRegion(area.province), area.province]));
  return groups.flatMap((group) => {
    const province = provinces.get(normalizeRecommendationRegion(group.province));
    return province === undefined ? [] : [{ ...group, province }];
  });
}
