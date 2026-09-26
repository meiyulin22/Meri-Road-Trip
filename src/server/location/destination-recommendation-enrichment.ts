import type { DestinationRecommendations } from "@/domain/location/destination-recommendations";
import { resolveDestinationCandidates } from "@/domain/location/destination-resolution-policy";
import { AmapLocationProvider } from "@/infrastructure/location/amap-location-provider";
import { logger } from "@/server/observability/logger";

type Recommendation = DestinationRecommendations["destinations"][number];

export type RecommendationEnrichment = {
  readonly matched: boolean;
  readonly imageUrl: string | null;
};

function normalize(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, "");
}

function photoUrl(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  for (const photo of value) {
    if (typeof photo !== "object" || photo === null || !("url" in photo) || typeof photo.url !== "string") continue;
    try {
      const url = new URL(photo.url);
      if (url.protocol === "https:") return url.toString();
    } catch { /* An invalid provider URL is simply unusable. */ }
  }
  return null;
}

export class DestinationRecommendationEnricher {
  constructor(
    private readonly locations = new AmapLocationProvider(),
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async enrich(recommendation: Recommendation): Promise<RecommendationEnrichment> {
    try {
      const search = await this.locations.searchByKeyword(recommendation.name);
      if (search.status === "failure") return { matched: false, imageUrl: null };
      const region = recommendation.region === null ? null : normalize(recommendation.region);
      const candidates = region === null ? search.candidates : search.candidates.filter((candidate) =>
        candidate.region !== null && normalize(candidate.region).includes(region));
      const resolution = resolveDestinationCandidates(recommendation.name, candidates);
      if (resolution.status !== "resolved") return { matched: false, imageUrl: null };

      const key = process.env.AMAP_API_KEY?.trim();
      if (!key) return { matched: true, imageUrl: null };
      const url = new URL("https://restapi.amap.com/v5/place/detail");
      url.searchParams.set("key", key);
      url.searchParams.set("id", resolution.candidate.providerId);
      url.searchParams.set("show_fields", "photos");
      try {
        const response = await this.fetcher(url, { cache: "no-store", signal: AbortSignal.timeout(8_000) });
        if (!response.ok) return { matched: true, imageUrl: null };
        const body: unknown = await response.json();
        if (typeof body !== "object" || body === null || !("status" in body) || body.status !== "1" ||
          !("pois" in body) || !Array.isArray(body.pois)) return { matched: true, imageUrl: null };
        const poi = body.pois.find((item: unknown) =>
          typeof item === "object" && item !== null && "id" in item && item.id === resolution.candidate.providerId);
        return { matched: true, imageUrl: poi && "photos" in poi ? photoUrl(poi.photos) : null };
      } catch {
        logger.warn({ event: "destination.recommendation.photo_failed" }, "Destination photo lookup unavailable");
        return { matched: true, imageUrl: null };
      }
    } catch {
      // Provider errors can contain the API key. Never log their raw message or URL.
      logger.warn({ event: "destination.recommendation.enrichment_failed" }, "Destination enrichment unavailable");
      return { matched: false, imageUrl: null };
    }
  }
}
