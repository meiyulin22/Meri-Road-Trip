type RecommendationIdentity = {
  readonly name: string;
  readonly region: string | null;
  readonly providerIdentity?: string;
};

export function normalizeRecommendationName(value: string): string {
  const name = value.normalize("NFKC").replace(/[\s\u200B\u2060]+/gu, "").toLowerCase();
  // Only presentation suffixes: never remove route, peak, or administrative names.
  const base = name.replace(/(?:\((?:风景名胜区|旅游景区|风景区|景区)\)|风景名胜区|旅游景区|风景区|景区)$/u, "");
  return base.length >= 2 ? base : name;
}

export function normalizeRecommendationRegion(value: string): string {
  return value.normalize("NFKC").replace(/[\s\u200B\u2060]+/gu, "").toLowerCase()
    .replace(/(?:省|壮族自治区|回族自治区|维吾尔自治区|自治区|特别行政区)$/u, "");
}

function sameDestination(left: RecommendationIdentity, right: RecommendationIdentity): boolean {
  if (left.providerIdentity && left.providerIdentity === right.providerIdentity) return true;
  if (normalizeRecommendationName(left.name) !== normalizeRecommendationName(right.name)) return false;
  // A missing region cannot establish that identical names refer to different places.
  return left.region === null || right.region === null ||
    normalizeRecommendationRegion(left.region) === normalizeRecommendationRegion(right.region);
}

/** Keep the first candidate, or highest-ranked item, without changing its fields. */
export function deduplicateRecommendationDestinations<T>(
  items: readonly T[],
  identity: (item: T) => RecommendationIdentity,
): readonly T[] {
  const kept: T[] = [];
  for (const item of items) {
    if (!kept.some((previous) => sameDestination(identity(previous), identity(item)))) kept.push(item);
  }
  return kept;
}
