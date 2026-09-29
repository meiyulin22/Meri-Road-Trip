import type { LocationCandidate } from "./location";

export type DestinationResolution =
  | { readonly status: "resolved"; readonly candidate: LocationCandidate }
  | { readonly status: "ambiguous"; readonly candidates: readonly LocationCandidate[] }
  /**
   * The expression names a whole province. That is a real answer — 「我想去海南」 is
   * something the user knows and we do not — it simply is not a point, so it is
   * reported as the area it is instead of as a failure to find anything.
   */
  | { readonly status: "area"; readonly province: string }
  | { readonly status: "unresolved" };

const administrativeSuffixes = ["市", "区", "县", "镇", "乡", "村", "都"];

/**
 * 省 is absent from the administrative suffixes above on purpose: a point-shaped
 * destination cannot be a province. These suffixes are how a province is
 * recognised as one. 市 is not among them either — a municipality such as 北京市
 * is province-level, but it is also a city a plan can run on.
 */
const provinceSuffixes = ["省", "自治区", "特别行政区"];

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

  // A province is an area however the user spelled it, so 「海南省」 matching a
  // province POI by name exactly still does not make it a point.
  if (isProvinceName(name)) return false;

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

  if (reasonable.length === 1) return { status: "resolved", candidate: reasonable[0] };
  if (reasonable.length > 1) return { status: "ambiguous", candidates: reasonable };

  const province = matchedProvince(expression, candidates);
  return province === null ? { status: "unresolved" } : { status: "area", province };
}

/**
 * Amap files a province under its full name — 云南 is 云南省, 广西 is 广西壮族自治区 —
 * so the user's shorter words are a prefix of it. The provider's own province label
 * is preferred over the POI name, because that label is what places inside the
 * province will be grouped by.
 */
function matchedProvince(expression: string, candidates: readonly LocationCandidate[]): string | null {
  if (expression.length < 2) return null;
  for (const candidate of candidates) {
    const name = normalize(candidate.name);
    if (isProvinceName(name) && name.startsWith(expression)) return candidate.province ?? candidate.name;
  }
  return null;
}

function isProvinceName(name: string): boolean {
  return provinceSuffixes.some((suffix) => name.endsWith(suffix));
}
