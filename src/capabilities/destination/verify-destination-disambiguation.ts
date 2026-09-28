import type { LocationCandidate } from "@/domain/location/location";
import type { DestinationDisambiguation } from "@/domain/location/destination-disambiguation";
import { composeTurnReply, type DestinationTurnFact } from "@/capabilities/conversation/turn-reply";
import type { LocationService } from "./location-service";

export type DestinationDisambiguationResult =
  | { readonly status: "verified"; readonly candidates: readonly LocationCandidate[] }
  | { readonly status: "unresolved" }
  | { readonly status: "provider_error" };

export async function verifyDestinationDisambiguation(
  proposal: Extract<DestinationDisambiguation, { state: "known" }>,
  locationService: LocationService,
): Promise<DestinationDisambiguationResult> {
  const expressions = [...new Set(proposal.value.map((item) => item.trim()))].slice(0, 3);
  const results = await Promise.all(expressions.map((item) => locationService.resolveExpression(item)));
  const candidates: LocationCandidate[] = [];
  const seen = new Set<string>();
  for (const result of results) {
    const matches = result.status === "resolved" ? [result.candidate] :
      result.status === "ambiguous" ? result.candidates : [];
    for (const candidate of matches) {
      const identity = `${candidate.providerId}:${candidate.longitude},${candidate.latitude}`;
      if (seen.has(identity)) continue;
      seen.add(identity);
      candidates.push(candidate);
      if (candidates.length === 3) return { status: "verified", candidates };
    }
  }
  if (candidates.length > 0) return { status: "verified", candidates };
  return results.some((result) => result.status === "provider_error")
    ? { status: "provider_error" }
    : { status: "unresolved" };
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
      : { kind: "narrowing_offered", expression, candidateCount: result.candidates.length };
  // A disambiguation turn always has a fact worth stating, so no model reply is needed.
  return composeTurnReply({ modelReply: "", destination: fact, otherFieldsSaved: otherChangesSaved });
}
