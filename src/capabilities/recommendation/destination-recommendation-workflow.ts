import { randomUUID } from "node:crypto";

import type { CatalogCity } from "@/domain/catalog/city-scores";
import type { DestinationRecommendationGroup } from "@/domain/location/destination-recommendations";
import { normalizeRecommendationRegion } from "@/domain/location/recommendation-identity";
import type { DestinationArea } from "@/domain/trip-state/destination-areas";
import type { DestinationRecommendationPresentation } from "@/domain/trip-message/trip-message";
import { type ProvinceFilter, recommendCatalogCitiesFromEnvironment } from "@/platform/catalog/catalog-source";
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
    readonly catalogCities?: readonly CatalogCity[];
  }, requestId: string) => Promise<readonly DestinationRecommendationGroup[]>;
  readonly generateId: () => string;
  /** Cities Meri's catalog suggests (RAG step 4), or null to search the web as before. Absent, never asked. */
  readonly catalogCities?: (query: string, provinces: ProvinceFilter) => Promise<readonly CatalogCity[] | null>;
};

export function destinationRecommendationWorkflowDependencies(): DestinationRecommendationWorkflowDependencies {
  return {
    discovery: createBochaDiscoverySearchFromEnvironment(),
    generate: generateDestinationRecommendations,
    generateId: randomUUID,
    catalogCities: recommendCatalogCitiesFromEnvironment,
  };
}

/** The traveller's own recent words, newest first: what the catalog is searched by (no origin, unlike the web query). */
export function catalogQuery(context: DestinationRecommendationContext): string {
  return context.conversationHistory
    .filter((message) => message.role === "user")
    .slice(-3)
    .reverse()
    .map((message) => message.content.replace(/\s+/gu, " ").trim().slice(0, 120))
    .filter(Boolean)
    .join(" ")
    .slice(0, 300);
}

/** The same province rule the cards follow afterwards: inside the settled provinces, or outside the saved ones. */
export function catalogProvinces(context: DestinationRecommendationContext): ProvinceFilter {
  const provinces = (settledAreas(context) ?? []).map(({ province }) => province);
  if (provinces.length === 0) return {};
  return context.scope === "elsewhere" ? { except: provinces } : { only: provinces };
}

export async function runDestinationRecommendationWorkflow(
  context: DestinationRecommendationContext,
  requestId: string,
  dependencies: DestinationRecommendationWorkflowDependencies = destinationRecommendationWorkflowDependencies(),
): Promise<DestinationRecommendationWorkflowResult> {
  const startedAt = performance.now();
  logger.info({ event: "recommendation.workflow.started", requestId, source: context.source, scope: context.scope },
    "Destination recommendation workflow started");

  // Meri's catalog first (RAG step 4): when it has cities close enough to what was said, the web search is skipped.
  const catalogCities = dependencies.catalogCities
    ? await dependencies.catalogCities(catalogQuery(context), catalogProvinces(context))
    : null;
  const discovery = catalogCities?.length ? [] : await searchJourneyDiscovery(context, dependencies.discovery);
  const proposed = await dependencies.generate({
    ...context,
    ...(discovery.length ? { discoveryResults: discovery } : {}),
    ...(catalogCities?.length ? { catalogCities } : {}),
  }, requestId);
  const groups = context.scope === "elsewhere"
    ? outsideSavedProvinces(proposed, settledAreas(context))
    : withinSettledProvinces(proposed, settledAreas(context));
  // Cards are shown before their photos: each keeps its landmark, and the browser asks
  // for the photos once the cards are on screen (recommendation-photos.ts).
  const destinations = groups.flatMap((group) => group.places.map((place) => ({
    id: dependencies.generateId(), name: place.name, province: group.province, reason: place.reason,
    ...(place.landmark ? { landmark: place.landmark } : {}),
    ...(place.landmark && place.landmarkEn ? { landmarkEn: place.landmarkEn } : {}),
    ...(place.landmark && place.landmarkAliases?.length ? { landmarkAliases: place.landmarkAliases } : {}),
    ...(place.backupLandmarks?.length ? { backupLandmarks: place.backupLandmarks } : {}),
  })));

  logger.info({ event: "recommendation.workflow.completed", requestId,
    discoveryCount: discovery.length, catalogCityCount: catalogCities?.length ?? 0, proposedProvinceCount: proposed.length,
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
