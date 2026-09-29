import type { LocationCandidate } from "@/domain/location/location";
import type { DestinationRecommendationPresentation } from "@/domain/trip-message/trip-message";
import type { DestinationDisambiguation } from "@/domain/location/destination-disambiguation";
import { composeTurnReply, type DestinationTurnFact } from "@/capabilities/conversation/turn-reply";
import type { LocationService } from "./location-service";

/**
 * A 市 the broad expression turned out to contain, named the way the destination
 * itself names places so the same picker and the same write path can be used.
 */
export interface DisambiguatedPlace {
  readonly id: string;
  readonly name: string;
  readonly province: string | null;
}

export type DestinationDisambiguationResult =
  | { readonly status: "verified"; readonly places: readonly DisambiguatedPlace[] }
  | { readonly status: "unresolved" }
  | { readonly status: "provider_error" };

/**
 * 「潮汕」 is a colloquial name for 潮州市、汕头市、揭阳市, so narrowing it is the same
 * question the recommendation cards ask: which 市 inside the province. Whatever the
 * provider matched — a 市 or a 景点 inside one — is traced back to its 市, because a
 * 景点 is Generate plan's question rather than a destination.
 */
export async function verifyDestinationDisambiguation(
  proposal: Extract<DestinationDisambiguation, { state: "known" }>,
  locationService: LocationService,
): Promise<DestinationDisambiguationResult> {
  const expressions = [...new Set(proposal.value.map((item) => item.trim()))].slice(0, 3);
  const results = await Promise.all(expressions.map((item) => locationService.resolveExpression(item)));
  const places: DisambiguatedPlace[] = [];
  const seen = new Set<string>();
  const ids = new Set<string>();
  for (const result of results) {
    const matches = result.status === "resolved" ? [result.candidate] :
      result.status === "ambiguous" ? result.candidates : [];
    for (const candidate of matches) {
      const city = cityOf(candidate);
      if (city === null) continue;
      const identity = `${candidate.province ?? ""}|${city}`;
      if (seen.has(identity) || ids.has(candidate.providerId)) continue;
      seen.add(identity);
      ids.add(candidate.providerId);
      places.push({ id: candidate.providerId, name: city, province: candidate.province });
      break;
    }
  }
  if (places.length > 0) return { status: "verified", places };
  return results.some((result) => result.status === "provider_error")
    ? { status: "provider_error" }
    : { status: "unresolved" };
}

/**
 * A 直辖市 is filed as a province with no city under it, and it is still the 市 a
 * plan runs on, so it answers for itself.
 */
function cityOf(candidate: LocationCandidate): string | null {
  if (candidate.city !== null && candidate.city.trim() !== "") return candidate.city.trim();
  const province = candidate.province?.trim() ?? "";
  return province.endsWith("市") ? province : null;
}

/**
 * The narrowed 市 are offered through the destination cards rather than through the
 * location candidates they were found with: several can be picked at once, and
 * picking them writes the province and the 市 together.
 */
export function narrowingPresentation(
  result: Extract<DestinationDisambiguationResult, { status: "verified" }>,
): DestinationRecommendationPresentation {
  return { type: "destination_recommendations", destinations: result.places };
}

export function replyForDestinationDisambiguation(
  expression: string,
  result: DestinationDisambiguationResult,
  otherChangesSaved: boolean,
): string {
  const fact: DestinationTurnFact = result.status === "provider_error"
    ? { kind: "lookup_unavailable", expression }
    : result.status === "unresolved"
      ? { kind: "not_identified", expression }
      : { kind: "narrowing_offered", expression, placeCount: result.places.length };
  // A disambiguation turn always has a fact worth stating, so no model reply is needed.
  return composeTurnReply({ modelReply: "", destination: fact, otherFieldsSaved: otherChangesSaved });
}
