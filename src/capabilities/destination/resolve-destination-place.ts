import type { LocationCandidate } from "@/domain/location/location";
import { isChinaProvince } from "@/domain/location/china-destination-scope";
import type { DestinationPick } from "@/domain/trip-state/destination-areas";

import type { LocationResolveResult } from "./location-service";

/** A pick together with the provider identity it came from, so it can be offered as a card. */
export interface IdentifiedPick extends DestinationPick {
  readonly id: string;
  readonly detail?: string;
}

export type PlaceResolution =
  /**
   * `exact` says the provider's name is the user's own words plus nothing but an
   * administrative or scenic-area suffix — 大连 → 大连市, 迪庆 → 迪庆藏族自治州,
   * 玉龙雪山 → 玉龙雪山风景区. Only then is there nothing left for the user to check,
   * so only then may a place they named go straight into the Journey.
   */
  | { readonly status: "resolved"; readonly pick: IdentifiedPick; readonly exact: boolean }
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
      if (!isChinaProvince(result.province)) return { status: "unresolved" };
      return { status: "resolved", pick: { id: `province:${result.province}`, province: result.province, place: null, spot: null },
        exact: namesSamePlace(result.province, expression) };
    case "resolved": {
      const pick = pickFromCandidate(result.candidate, expression);
      return pick === null ? { status: "unresolved" }
        : { status: "resolved", pick, exact: namesSamePlace(result.candidate.name, expression) };
    }
    case "ambiguous": {
      // Two provider records in one city may be different spots. Keep both until
      // the traveler decides which one they meant.
      const options = distinctPicks(result.candidates.map((candidate) => pickFromCandidate(candidate, expression)));
      // 梅里雪山 comes back as the mountain, its national park and a viewpoint, all in
      // one 市 and all the same wish. They are one place to the traveller.
      if (options.length > 0 && new Set(options.map(preferenceKey)).size === 1) {
        const sources = result.candidates.filter((candidate) => options.some((option) => option.id === candidate.providerId));
        return { status: "resolved", pick: options[0],
          exact: sources.some((candidate) => namesSamePlace(candidate.name, expression)) };
      }
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
    if (!isChinaProvince(candidate.province)) continue;
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
  if (!province || !isChinaProvince(province) || place === null) return null;
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

function preferenceKey(pick: IdentifiedPick): string {
  return JSON.stringify([pick.province, pick.place, pick.spot]);
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

const administrativeSuffix = /^(?:[\p{Script=Han}]{1,3}?族)*(?:特别行政区|自治区|自治州|自治县|地区|省|市|县|区|盟)$/u;
const scenicSuffix = /^(?:风景名胜区|风景区|景区|旅游区|国家公园|国家级自然保护区|自然保护区)$/u;

/**
 * Whether a provider name is the user's expression and nothing more than a suffix
 * that does not change which place it is. A typo, a partial name or a different
 * place all fail, and are offered as choices instead.
 */
export function namesSamePlace(providerName: string, expression: string): boolean {
  const name = normalize(providerName);
  const said = normalize(expression);
  if (said.length < 2 || !name.startsWith(said)) return false;
  const rest = name.slice(said.length);
  return rest === "" || administrativeSuffix.test(rest) || scenicSuffix.test(rest);
}

function normalize(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, "").trim();
}
