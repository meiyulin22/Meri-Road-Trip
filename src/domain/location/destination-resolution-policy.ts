import type { LocationCandidate } from "./location";

export type DestinationResolution =
  | { readonly status: "resolved"; readonly candidate: LocationCandidate }
  | { readonly status: "ambiguous"; readonly candidates: readonly LocationCandidate[] }
  | { readonly status: "unresolved" };

const administrativeSuffixes = ["市", "区", "县", "镇", "乡", "村", "都"];

/**
 * Amap names a scenic destination in full: 稻城亚丁 is "稻城亚丁风景区", 贡嘎山 is
 * "贡嘎山国家级自然保护区", 西湖 is "西湖风景名胜区". Requiring the name to match the
 * user's words exactly left almost every outdoor destination in China
 * unresolvable, which ended the disambiguation flow with "be more specific"
 * however specific the user had been.
 *
 * Transport is deliberately absent from this list. "稻城亚丁机场" is how one
 * reaches 稻城亚丁 from 200km away, not the place itself, and a plan built on the
 * airport's coordinates would be a plan for the wrong valley.
 */
const geographicFeatureSuffixes = [
  "风景名胜区", "风景区", "景区",
  "国家级自然保护区", "自然保护区",
  "国家森林公园", "森林公园",
  "国家地质公园", "地质公园",
  "国家公园",
  "旅游度假区", "旅游区", "度假区",
];

function normalize(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, "").trim();
}

function isReasonableMatch(expression: string, candidate: LocationCandidate): boolean {
  const name = normalize(candidate.name);
  if (
    candidate.providerId.trim() === "" ||
    name === "" ||
    !Number.isFinite(candidate.longitude) ||
    !Number.isFinite(candidate.latitude) ||
    Math.abs(candidate.longitude) > 180 ||
    Math.abs(candidate.latitude) > 90
  ) return false;

  if (expression === name) return true;

  // A bare name can refer to more than one place (e.g. 朝阳), so two characters is
  // the least that can carry a fuller official name.
  if (expression.length >= 2 && [...administrativeSuffixes, ...geographicFeatureSuffixes]
    .some((suffix) => name === `${expression}${suffix}`)) {
    return true;
  }

  // Explicit geographic qualification can distinguish places with the same name.
  if (!expression.endsWith(name)) return false;
  const qualifier = expression.slice(0, -name.length);
  return qualifier.length >= 2 &&
    [candidate.region, candidate.address].some((part) => part !== null && normalize(part).includes(qualifier));
}

export function resolveDestinationCandidates(
  destination: string,
  candidates: readonly LocationCandidate[],
): DestinationResolution {
  const expression = normalize(destination);
  if (expression === "") return { status: "unresolved" };

  const seen = new Set<string>();
  const reasonable = candidates.filter((candidate) => {
    if (!isReasonableMatch(expression, candidate)) return false;
    const identity = `${candidate.providerId}:${candidate.longitude},${candidate.latitude}`;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });

  if (reasonable.length === 0) return { status: "unresolved" };
  if (reasonable.length === 1) return { status: "resolved", candidate: reasonable[0] };
  return { status: "ambiguous", candidates: reasonable };
}
