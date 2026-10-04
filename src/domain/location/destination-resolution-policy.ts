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
  "国家公园景区",
  "国家公园",
  "旅游度假区", "旅游区", "度假区",
];

function normalize(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, "").trim();
}

function isUsableCandidate(candidate: LocationCandidate): boolean {
  const name = normalize(candidate.name);
  return candidate.providerId.trim() !== "" &&
    name !== "" &&
    Number.isFinite(candidate.longitude) &&
    Number.isFinite(candidate.latitude) &&
    Math.abs(candidate.longitude) <= 180 &&
    Math.abs(candidate.latitude) <= 90 &&
    // A province is an area however the user spelled it, so 「海南省」 matching a
    // province POI by name exactly still does not make it a point.
    !isProvinceName(name);
}

/** The user's words, alone or with a suffix that names the same place more fully. */
function isExpressionWithSuffix(expression: string, name: string): boolean {
  if (expression === name) return true;
  // A bare name can refer to more than one place (e.g. 朝阳), so two characters is
  // the least that can carry a fuller official name.
  return expression.length >= 2 && [...administrativeSuffixes, ...geographicFeatureSuffixes]
    .some((suffix) => name === `${expression}${suffix}`);
}

/**
 * The provider's name for a candidate, and the same name without its own 市 or 区县
 * in front. Amap often files a sight under where it is — 杭州西湖风景名胜区 (杭州市),
 * 甘孜稻城亚丁景区 (甘孜藏族自治州). That prefix only says where the sight is, which the
 * record itself confirms, so it does not make it another place. The prefix is what
 * the name and its 市 or 区县 share at the start, at least two characters, so a
 * prefecture's short form (甘孜) needs no list of ethnic names to recognise.
 */
export function namesWithoutOwnPlace(
  name: string,
  candidate: Pick<LocationCandidate, "city" | "district" | "province">,
): readonly string[] {
  const normalized = normalize(name);
  const city = candidate.city ?? (candidate.province?.endsWith("市") ? candidate.province : null);
  const variants = [normalized];
  for (const place of [city, candidate.district]) {
    if (place === null) continue;
    const own = normalize(place);
    let shared = 0;
    while (shared < own.length && shared < normalized.length && own[shared] === normalized[shared]) shared += 1;
    if (shared >= 2 && shared < normalized.length) variants.push(normalized.slice(shared));
  }
  return [...new Set(variants)];
}

function isReasonableMatch(expression: string, candidate: LocationCandidate): boolean {
  if (!isUsableCandidate(candidate)) return false;
  const name = normalize(candidate.name);
  // 西湖 is filed as 杭州西湖风景名胜区: the city in front is only where it is.
  if (namesWithoutOwnPlace(name, candidate).some((variant) => isExpressionWithSuffix(expression, variant))) return true;

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

  const preferred = withoutDivisionsBesideSights(expression, reasonable);
  if (preferred.length === 1) return { status: "resolved", candidate: preferred[0] };
  if (preferred.length > 1) return { status: "ambiguous", candidates: preferred };

  const province = matchedProvince(expression, candidates);
  if (province !== null) return { status: "area", province };

  const loose = looseMatches(expression, candidates);
  if (loose.length === 1) return { status: "resolved", candidate: loose[0] };
  if (loose.length > 1) return { status: "ambiguous", candidates: loose };
  return { status: "unresolved" };
}

/**
 * Someone who says 西湖, 泰山 or 峨眉山 means the sight, not the 西湖区, 泰山区 or
 * 峨眉山市 named after it, so where both lie in the same 市 the district gives way.
 * Only a sight makes it give way, never another administrative name: 朝阳 can be
 * 辽宁's 朝阳市 or 朝阳县 — or 北京's 朝阳区 — and that stays the user's choice. A 市
 * itself never gives way either: 黄山市 and the 黄山 scenic area stay a real choice.
 */
function withoutDivisionsBesideSights(expression: string, candidates: readonly LocationCandidate[]): LocationCandidate[] {
  const isAdministrative = (candidate: LocationCandidate) =>
    administrativeSuffixes.some((suffix) => normalize(candidate.name) === `${expression}${suffix}`);
  const isDivision = (candidate: LocationCandidate) => isAdministrative(candidate) &&
    (candidate.city === null || normalize(candidate.name) !== normalize(candidate.city));
  const sightCities = new Set(candidates.filter((candidate) => !isAdministrative(candidate) && candidate.city !== null)
    .map((candidate) => normalize(candidate.city as string)));
  return candidates.filter((candidate) => !(isDivision(candidate) && candidate.city !== null &&
    sightCities.has(normalize(candidate.city))));
}

/**
 * The last resort, used only when nothing above matched: a name that ends with the
 * user's words after some other prefix, like 噶丹松赞林寺 for 松赞林寺. The prefix is
 * not a place the record can confirm, so the caller must not treat this as the user's
 * own name for it — it is offered for the user to confirm. Three characters at least,
 * because a shorter name ends far too many others (西湖 ends 瘦西湖).
 */
function looseMatches(expression: string, candidates: readonly LocationCandidate[]): LocationCandidate[] {
  if (expression.length < 3) return [];
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (!isUsableCandidate(candidate)) return false;
    const name = normalize(candidate.name);
    const at = name.indexOf(expression);
    if (at < 1) return false;
    const rest = name.slice(at + expression.length);
    if (rest !== "" && !geographicFeatureSuffixes.includes(rest)) return false;
    const identity = `${candidate.providerId}:${candidate.longitude},${candidate.latitude}`;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
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
