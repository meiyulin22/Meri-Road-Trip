import type { DestinationRecommendationContext } from "@/server/recommendation/destination-recommendation-context";
import type { DiscoverySearchResult } from "@/platform/search/discovery-search";

export function buildDestinationCandidateSystemPrompt(
  context: DestinationRecommendationContext & { readonly discoveryResults?: readonly DiscoverySearchResult[] },
): string {
  const trigger = context.source === "explicit_action"
    ? `Persisted UI action (not a user message): ${JSON.stringify(context.action)}`
    : "The current real user message in conversation history triggered destination suggestions. No UI action occurred.";
  const discovery = context.discoveryResults?.length
    ? `\n\nUnverified discovery search results (inspiration only; never proof of existence, access, legality, safety, or current conditions):\n${JSON.stringify(context.discoveryResults)}`
    : "";
  return `You are Meri, an outdoor travel companion. ${trigger} Generate 8 to 10 distinct destination or route candidates in Chinese based on the authoritative TripState and real conversation history. Build a broad but relevant pool that reflects expressed Journey-local preferences. Do not treat assistant suggestions as confirmed user preferences. Use concise real-world destination or route expressions; avoid vague categories and do not repeat a province in the name when region identifies it. Use a province-level region where useful and known, otherwise null. Give each candidate a short preferenceRationale explaining why it may fit the available preferences. Do not rank candidates or choose a Top 3. Do not assert access, legality, safety, current conditions, weather, route status, or other unverified facts. Do not generate IDs, provider metadata, coordinates, images, or a final reply. No additional tools or research are available. If preferences are sparse, include varied exploratory possibilities without inventing user preferences.\n\nAuthoritative TripState:\n${JSON.stringify(context.tripState)}${discovery}`;
}
