import type { DestinationRecommendationPresentation } from "@/domain/trip-message/trip-message";
import type { DestinationCandidate } from "@/domain/location/destination-candidates";
import { deduplicateRecommendationDestinations } from "@/domain/location/recommendation-identity";
import { createBochaDiscoverySearchFromEnvironment } from "@/platform/search/bocha-discovery-search";
import { generateDestinationCandidates } from "./destination-candidate-generator";
import { rankDestinationCandidates, type RankedDestinationCandidate } from "./destination-candidate-ranker";
import type { DestinationRecommendationContext } from "./destination-recommendation-context";
import { searchJourneyDiscovery, type DiscoverySearch, type DiscoverySearchResult } from "@/platform/search/discovery-search";
import { filterDestinationCandidatesByAccess, type DestinationAccessChecker } from "./destination-access-filter";
import { enrichRankedTopThree, type TopThreeEnrichmentResult } from "./enrich-ranked-destinations";
import { createOfficialDestinationAccessCheckerFromEnvironment } from "./official-destination-access-checker";
import { logger } from "@/platform/observability/logger";

export type DestinationRecommendationWorkflowResult = {
  readonly content: string;
  readonly presentation?: DestinationRecommendationPresentation;
};

export type DestinationRecommendationWorkflowDependencies = {
  readonly discovery: DiscoverySearch;
  readonly generateCandidates: (context: DestinationRecommendationContext & {
    readonly discoveryResults?: readonly DiscoverySearchResult[];
  }, requestId: string) => Promise<readonly DestinationCandidate[]>;
  readonly access: DestinationAccessChecker;
  readonly rank: (context: DestinationRecommendationContext, eligible: readonly DestinationCandidate[],
    requestId: string, discovery: readonly DiscoverySearchResult[]) => Promise<readonly RankedDestinationCandidate[]>;
  readonly enrich: (ranked: readonly RankedDestinationCandidate[]) => Promise<TopThreeEnrichmentResult>;
};

export function destinationRecommendationWorkflowDependencies(): DestinationRecommendationWorkflowDependencies {
  return {
    discovery: createBochaDiscoverySearchFromEnvironment(),
    generateCandidates: generateDestinationCandidates,
    access: createOfficialDestinationAccessCheckerFromEnvironment(),
    rank: rankDestinationCandidates,
    enrich: enrichRankedTopThree,
  };
}

export async function runDestinationRecommendationWorkflow(
  context: DestinationRecommendationContext,
  requestId: string,
  dependencies: DestinationRecommendationWorkflowDependencies = destinationRecommendationWorkflowDependencies(),
): Promise<DestinationRecommendationWorkflowResult> {
  const startedAt = performance.now();
  logger.info({ event: "recommendation.workflow.started", requestId, source: context.source },
    "Destination recommendation workflow started");

  const discovery = await searchJourneyDiscovery(context, dependencies.discovery);
  const candidates = await dependencies.generateCandidates(
    discovery.length ? { ...context, discoveryResults: discovery } : context, requestId);
  const access = await filterDestinationCandidatesByAccess(candidates, dependencies.access);
  const eligible = deduplicateRecommendationDestinations(access.eligible.map((item) => item.candidate), (candidate) => candidate);
  const ranked = await dependencies.rank(context, eligible, requestId, discovery);
  const enriched = await dependencies.enrich(ranked);
  const distinct = deduplicateRecommendationDestinations(enriched.destinations,
    (item) => ({ ...item.candidate, providerIdentity: item.providerIdentity }));
  const destinations = distinct.map(({ candidate, reason, imageUrl }) => ({
    id: candidate.id, name: candidate.name, region: candidate.region, reason, imageUrl,
  }));

  logger.info({ event: "recommendation.workflow.completed", requestId,
    discoveryCount: discovery.length, candidateCount: candidates.length, blockedCount: access.blocked.length,
    clearCount: access.eligible.filter((item) => item.access.status === "clear").length,
    uncertainCount: access.eligible.filter((item) => item.access.status === "uncertain").length,
    rankedCount: ranked.length, enrichedCount: enriched.destinations.length, cardCount: destinations.length,
    durationMs: Math.round(performance.now() - startedAt) }, "Destination recommendation workflow completed");

  if (!destinations.length) {
    return { content: "这次没有筛出合适的目的地。你可以调整一下偏好，我们再找找其他方向。" };
  }
  return {
    content: "我结合你刚才的偏好筛了几个方向，你可以看看更想去哪一个。",
    presentation: { type: "destination_recommendations", destinations },
  };
}
