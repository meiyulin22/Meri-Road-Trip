import type { DestinationCandidate } from "@/domain/location/destination-candidates";
import { generateDestinationCandidates } from "@/server/ai/destination-candidate-generator";
import type { DestinationRecommendationContext } from "@/server/ai/destination-recommendation-context";
import { searchJourneyDiscovery, type DiscoverySearch, type DiscoverySearchResult } from "@/platform/search/discovery-search";

type GenerateCandidates = (
  context: DestinationRecommendationContext & { readonly discoveryResults?: readonly DiscoverySearchResult[] },
  requestId: string,
) => Promise<readonly DestinationCandidate[]>;

export async function generateCandidatesWithDiscovery(
  context: DestinationRecommendationContext,
  requestId: string,
  search: DiscoverySearch,
  generate: GenerateCandidates = generateDestinationCandidates,
): Promise<readonly DestinationCandidate[]> {
  const discoveryResults = await searchJourneyDiscovery(context, search);
  return generate(discoveryResults.length ? { ...context, discoveryResults } : context, requestId);
}
