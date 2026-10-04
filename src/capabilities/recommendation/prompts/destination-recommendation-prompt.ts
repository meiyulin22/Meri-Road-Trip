import { destinationProvinceText } from "@/domain/trip-state/destination-areas";
import type { DestinationRecommendationContext } from "@/capabilities/recommendation/destination-recommendation-context";
import type { DiscoverySearchResult } from "@/platform/search/discovery-search";
import { shownCardsGuidance } from "@/capabilities/conversation/conversation-history-content";
import { promptLanguageName } from "@/capabilities/conversation/prompts/reply-language-guidance";

export function buildDestinationRecommendationSystemPrompt(
  context: DestinationRecommendationContext & { readonly discoveryResults?: readonly DiscoverySearchResult[] },
): string {
  const trigger = "The current real user message in conversation history triggered destination suggestions. No UI action occurred.";
  const discovery = context.discoveryResults?.length
    ? `\n\nUnverified discovery search results (inspiration only; never proof of existence, access, legality, safety, or current conditions):\n${JSON.stringify(context.discoveryResults)}`
    : "";
  return `You are Meri, an outdoor travel companion. ${trigger} Propose places the user could go, grouped by province, from the authoritative TripState and the real conversation history.

Each place is one prefecture-level city or autonomous prefecture — 丽江市, 甘孜藏族自治州, 三亚市. Never a province, and never a single 景点、景区、山、湖、镇 or 村: which landmarks are worth the drive is decided later, when the plan is generated. Name the group with the full province-level name (云南省, 广西壮族自治区, 北京市).
Meri plans trips to destinations in China, for travellers from any country. Recommend only places inside the Chinese province-level regions allowed by the schema. Never recommend a place outside China or label one as belonging to a Chinese province, even if the history or discovery results mention it.

${scopeInstruction(context)}

${reasonInstruction(context)} Do not treat assistant suggestions as confirmed user preferences, and do not invent preferences the user has not expressed. Do not assert access, legality, safety, opening status, weather, route status, prices, or availability: none of that is verified here. Each landmark is the one well-known scenic spot inside that place that best shows it, by its common name, preferably the one the reason speaks of; it only picks the card's photo. Do not generate IDs, coordinates, image URLs, or a reply. No tools or research are available beyond what is given below.

${shownCardsGuidance}

Authoritative TripState:
${JSON.stringify(context.tripState)}${discovery}`;
}

/**
 * The cards follow the language chosen on the landing page, not the language of the
 * last message: they sit in the interface beside its own labels. The names are not
 * translated — the schema's provinces are Chinese, and Amap looks every place up in
 * Chinese.
 */
function reasonInstruction(context: DestinationRecommendationContext): string {
  const length = context.locale === "zh" ? "at most 30 characters" : "at most 15 words";
  return `Each reason says in one short ${promptLanguageName(context.locale)} sentence, ${length}, why that place may fit what the user has told us. Write every reason in ${promptLanguageName(context.locale)}, even when the conversation is in another language. Province, place and landmark names stay in Chinese, as the examples show.`;
}

/**
 * A settled destination is the strongest preference the user has expressed, so the
 * list stays inside it: 「我想去海南，推荐一下」 asks which part of 海南, and answering
 * with 西藏 ignores the one thing they said.
 */
function scopeInstruction(context: DestinationRecommendationContext): string {
  const areas = context.tripState.destination.state === "missing"
    ? undefined
    : context.tripState.destination.areas;
  if (context.scope === "elsewhere" && areas?.length) {
    return `The user has already saved ${destinationProvinceText(areas)} and asked for somewhere else. Recommend places only in other provinces, never in those: choose 2 to 4 provinces that fit what the user said, 2 to 3 places in each, at most 12 places in total. What is saved stays; these are additions to consider.`;
  }
  if (!areas?.length) {
    return "No destination is settled yet, so choose 2 to 4 provinces that fit what the user said, 2 to 3 places in each, and at most 12 places in total. Offer enough to choose from: several places are picked at once, and a trip crossing two provinces is normal.";
  }
  return `The destination is already settled as ${destinationProvinceText(areas)}. Recommend places only inside those, cover every one of them, and give 3 to 6 places in each, at most 12 in total.`;
}
