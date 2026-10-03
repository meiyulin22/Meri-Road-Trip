import type { LocationCandidate } from "@/domain/location/location";
import { isDomesticProvince } from "@/domain/location/domestic-destination-scope";
import type { DestinationPick } from "@/domain/trip-state/destination-areas";

import type { LocationResolveResult } from "./location-service";

/** A pick together with the provider identity it came from, so it can be offered as a card. */
export interface IdentifiedPick extends DestinationPick {
  readonly id: string;
  readonly detail?: string;
}

export type PlaceResolution =
  | { readonly status: "resolved"; readonly pick: IdentifiedPick }
  /** The name fits several different 市 — 朝阳 is in 北京 and in 辽宁. */
  | { readonly status: "ambiguous"; readonly options: readonly IdentifiedPick[] }
  | { readonly status: "unresolved" }
  | { readonly status: "provider_error" };

export type ResolveExpression = (expression: string) => Promise<LocationResolveResult>;

/**
 * The one way a name becomes part of a destination. Chat, the editor's search and the
 * first message all come through here, so 「梅里雪山」 lands the same way whoever typed
 * it: a province stays a province, a 市 is that 市, and anything smaller is traced up
 * to the 市 it lies in and kept as a spot there.
 */
export async function resolveDestinationPlace(
  expression: string,
  resolveExpression: ResolveExpression,
): Promise<PlaceResolution> {
  const result = await resolveExpression(expression);
  switch (result.status) {
    case "area":
      if (!isDomesticProvince(result.province)) return { status: "unresolved" };
      return { status: "resolved", pick: { id: `province:${result.province}`, province: result.province, place: null, spot: null } };
    case "resolved": {
      const pick = pickFromCandidate(result.candidate, expression);
      return pick === null ? { status: "unresolved" } : { status: "resolved", pick };
    }
    case "ambiguous": {
      // Two provider records in one city may be different spots. Keep both until
      // the traveler decides which one they meant.
      const options = distinctPicks(result.candidates.map((candidate) => pickFromCandidate(candidate, expression)));
      if (options.length === 1) return { status: "resolved", pick: options[0] };
      return options.length === 0 ? { status: "unresolved" } : { status: "ambiguous", options };
    }
    case "provider_error":
      return { status: "provider_error" };
    case "unresolved":
    case "not_ready":
      return { status: "unresolved" };
  }
}

/**
 * Search results for the destination editor, each already traced to where it would
 * land, so the list can say 「梅里雪山 → 迪庆藏族自治州」 before anything is added.
 */
export function picksFromSearch(candidates: readonly LocationCandidate[]): readonly (IdentifiedPick & {
  readonly label: string;
})[] {
  const seen = new Set<string>();
  const results: (IdentifiedPick & { readonly label: string })[] = [];
  for (const candidate of candidates) {
    if (!isDomesticProvince(candidate.province)) continue;
    const pick = isProvinceCandidate(candidate)
      ? { id: candidate.providerId, province: candidate.province ?? candidate.name, place: null, spot: null }
      : pickFromCandidate(candidate, candidate.name);
    if (pick === null) continue;
    const key = pick.id;
    if (seen.has(key)) continue;
    seen.add(key);
    const detail = candidateDetail(candidate, candidate.name);
    results.push({ ...pick, label: candidate.name,
      ...(detail ? { detail } : {}) });
  }
  return results;
}

function pickFromCandidate(candidate: LocationCandidate, expression: string): IdentifiedPick | null {
  const province = candidate.province?.trim();
  const place = cityOf(candidate);
  if (!province || !isDomesticProvince(province) || place === null) return null;
  const detail = candidateDetail(candidate, expression);
  return { id: candidate.providerId, province, place, spot: spotOf(candidate, place, expression),
    ...(detail ? { detail } : {}) };
}

function candidateDetail(candidate: LocationCandidate, expression: string): string | null {
  const details = [normalize(candidate.name) === normalize(expression) ? null : candidate.name,
    candidate.district, candidate.address].filter((part): part is string =>
    part !== null && part.trim() !== "");
  return [...new Set(details)].join(" · ") || null;
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
 * The candidate is the 市 itself when its name is the 市's name; anything else inside
 * it is a spot the user asked for. The user's own words name the spot when the
 * provider only added a suffix — 「稻城亚丁」 rather than 「稻城亚丁风景区」.
 */
function spotOf(candidate: LocationCandidate, place: string, expression: string): string | null {
  const name = normalize(candidate.name);
  if (name === normalize(place) || normalize(place).startsWith(name)) return null;
  // County-level cities remain preferences under their prefecture. Use the
  // provider's full administrative name so confirmation repeats a precise search.
  if (candidate.district !== null && name === normalize(candidate.district)) return candidate.name;
  const said = normalize(expression);
  return said.length >= 2 && name.startsWith(said) ? expression.trim() : candidate.name;
}

function isProvinceCandidate(candidate: LocationCandidate): boolean {
  return ["省", "自治区", "特别行政区"].some((suffix) => normalize(candidate.name).endsWith(suffix));
}

function distinctPicks(picks: readonly (IdentifiedPick | null)[]): readonly IdentifiedPick[] {
  const seen = new Set<string>();
  return picks.filter((pick): pick is IdentifiedPick => {
    if (pick === null) return false;
    const key = pick.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalize(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, "").trim();
}
