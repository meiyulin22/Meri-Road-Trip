import type { LocationCandidate } from "@/domain/location/location";
import type { DestinationDisambiguation } from "@/domain/location/destination-disambiguation";
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
  const otherChanges = otherChangesSaved ? "其他旅程信息也已保存。" : "";
  if (result.status === "provider_error") {
    return `${otherChanges}暂时无法验证「${expression}」的具体地点，目的地还没有更改。请稍后再试。`;
  }
  if (result.status === "unresolved") {
    return `${otherChanges}请告诉我「${expression}」中更具体的地点，目的地还没有更改。`;
  }
  return result.candidates.length === 1
    ? `${otherChanges}「${expression}」范围比较大，我找到一个更具体的地点。要把下方地点设为目的地吗？`
    : `${otherChanges}「${expression}」范围比较大，我找到几个更具体的地点，你更想去哪个？`;
}
