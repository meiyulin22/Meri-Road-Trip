import { createBochaDestinationImageSearchFromEnvironment } from "@/platform/search/bocha-destination-image-search";
import type { RankedDestinationCandidate } from "./destination-candidate-ranker";
import type { DestinationImageSearch, DestinationImageSearchResult } from "@/platform/search/destination-image-search";
import { DestinationRecommendationEnricher } from "./destination-recommendation-enrichment";

const MAX_RANKED_CANDIDATES = 3;
const MIN_IMAGE_WIDTH = 320;
const MIN_IMAGE_HEIGHT = 180;
const OBVIOUS_NON_PHOTO = /(?:^|[\/._-])(?:favicon|logo|icon|avatar)(?:[\/._-]|$)/iu;

export type EnrichedRankedDestination = RankedDestinationCandidate & {
  readonly imageUrl: string | null;
  readonly providerIdentity?: string;
};
export type TopThreeEnrichmentResult = { readonly destinations: readonly EnrichedRankedDestination[] };

export type TopThreeEnrichmentDependencies = {
  readonly amap: Pick<DestinationRecommendationEnricher, "enrich">;
  readonly images: DestinationImageSearch;
};

function validUrl(value: string, protocols: readonly string[]): URL | null {
  try {
    const url = new URL(value);
    return protocols.includes(url.protocol) ? url : null;
  } catch { return null; }
}

export function usableBochaImageUrl(image: DestinationImageSearchResult): string | null {
  const contentUrl = validUrl(image.contentUrl, ["https:"]);
  if (!contentUrl || !validUrl(image.hostPageUrl, ["http:", "https:"])) return null;
  if (image.width !== undefined && image.width < MIN_IMAGE_WIDTH) return null;
  if (image.height !== undefined && image.height < MIN_IMAGE_HEIGHT) return null;
  if (image.width !== undefined && image.height !== undefined && image.width / image.height > 5) return null;
  if (OBVIOUS_NON_PHOTO.test(contentUrl.pathname)) return null;
  return contentUrl.toString();
}

export function buildDestinationImageQuery(candidate: RankedDestinationCandidate["candidate"]): string {
  return [candidate.name.trim(), candidate.region?.trim()].filter(Boolean).join(" ");
}

export async function enrichRankedTopThree(
  ranked: readonly RankedDestinationCandidate[],
  dependencies: TopThreeEnrichmentDependencies = {
    amap: new DestinationRecommendationEnricher(),
    images: createBochaDestinationImageSearchFromEnvironment(),
  },
): Promise<TopThreeEnrichmentResult> {
  if (ranked.length > MAX_RANKED_CANDIDATES) {
    throw new RangeError("Only the ranked Top 3 can be enriched.");
  }
  const destinations = await Promise.all(ranked.map(async (item): Promise<EnrichedRankedDestination> => {
    let imageUrl: string | null = null;
    let providerIdentity: string | undefined;
    try {
      const amap = await dependencies.amap.enrich({
        name: item.candidate.name, region: item.candidate.region, reason: item.reason,
      });
      if (amap.matched) providerIdentity = amap.providerIdentity;
      imageUrl = amap.matched && amap.imageUrl ? validUrl(amap.imageUrl, ["https:"])?.toString() ?? null : null;
    } catch { /* Image enrichment cannot remove a ranked recommendation. */ }
    if (imageUrl === null) {
      try {
        const results = await dependencies.images.search(buildDestinationImageQuery(item.candidate));
        imageUrl = results.map(usableBochaImageUrl).find((url): url is string => url !== null) ?? null;
      } catch { /* The existing card falls back to its local image when imageUrl is null. */ }
    }
    return { candidate: item.candidate, reason: item.reason, evidence: item.evidence, imageUrl,
      ...(providerIdentity ? { providerIdentity } : {}) };
  }));
  return { destinations };
}
