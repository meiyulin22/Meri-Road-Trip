import type { DestinationRecommendationContext } from "@/capabilities/recommendation/destination-recommendation-context";
import { logger } from "@/platform/observability/logger";

export type DiscoverySearchResult = {
  readonly source: string;
  readonly title: string;
  readonly snippet?: string;
  readonly url: string;
  readonly publishedAt?: string;
};

export interface DiscoverySearch {
  search(query: string): Promise<readonly DiscoverySearchResult[]>;
}

const MAX_QUERY_CHARACTERS = 160;
const MAX_DISCOVERY_RESULTS = 8;

export function buildDiscoveryQuery(context: DestinationRecommendationContext): string {
  const recentUserTexts = context.conversationHistory
    .filter((message) => message.role === "user")
    .slice(-3)
    .reverse()
    .map((message) => message.content.replace(/\s+/gu, " ").trim().slice(0, 60))
    .filter(Boolean);
  const origin = context.tripState.origin.state === "known" ? context.tripState.origin.value : "";
  const parts = [origin, ...recentUserTexts].filter(Boolean);
  return (parts.length ? parts.join(" ") : "旅行 目的地").slice(0, MAX_QUERY_CHARACTERS).trim();
}

export async function searchJourneyDiscovery(
  context: DestinationRecommendationContext,
  search: DiscoverySearch,
  log: Pick<typeof logger, "info" | "warn"> = logger,
): Promise<readonly DiscoverySearchResult[]> {
  const query = buildDiscoveryQuery(context);
  const startedAt = performance.now();
  try {
    const results = await search.search(query);
    const bounded = results.slice(0, MAX_DISCOVERY_RESULTS);
    log.info({ event: "discovery.search.completed", resultCount: bounded.length,
      durationMs: Math.round(performance.now() - startedAt) }, "Discovery search completed");
    return bounded;
  } catch (error) {
    // Provider errors can include the token-bearing request URL.
    const failureType = error instanceof DiscoverySearchError ? error.kind : "provider_error";
    log.warn({ event: "discovery.search.failed", failureType,
      durationMs: Math.round(performance.now() - startedAt) }, "Discovery search unavailable");
    return [];
  }
}

export class DiscoverySearchError extends Error {
  constructor(readonly kind: "configuration" | "http" | "api" | "invalid_response" | "timeout" | "network") {
    super(`Discovery search failed: ${kind}.`);
    this.name = "DiscoverySearchError";
  }
}
