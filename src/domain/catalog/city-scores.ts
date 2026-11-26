/**
 * Which cities Meri's catalog suggests for what a traveller said (RAG step 4, agreed with merlin
 * 2026-11-26): the catalog's spots and dishes nearest in meaning, summed per 州/市 with the best
 * match counting most. Measured on 11 sentences: on-topic ones had a best match of 0.58–0.71
 * cosine similarity, off-topic ones (极光, 量子物理, 火锅 before dishes counted) 0.43 or less.
 */
export const minCitySimilarity = 0.5;
/** Cities handed to the recommendation model, each with its best few matches. */
export const maxCatalogCities = 6;
const matchesPerCity = 3;
/**
 * The best match counts in full, the next half, the third a quarter. A plain sum let 阿坝 outrank
 * 成都 for 想看大熊猫 on three loose matches (熊猫海 is a lake) over 成都's one exact one.
 */
const matchWeights = [1, 0.5, 0.25] as const;

/** One catalog entry near the query: where it is and how close in meaning (cosine similarity). */
export type CatalogMatch = {
  readonly province: string;
  readonly city: string;
  readonly name: string;
  readonly kind: "spot" | "dish";
  readonly summary: string;
  readonly similarity: number;
};

/** A city the catalog suggests, with the matches that earned it, best first. */
export type CatalogCity = {
  readonly province: string;
  readonly city: string;
  readonly score: number;
  readonly matches: readonly Pick<CatalogMatch, "name" | "kind" | "summary">[];
};

/**
 * The best cities for the matches, or none when even the best match is below the threshold: the
 * catalog has nothing on the subject, and recommendations go back to web search.
 */
export function scoreCatalogCities(matches: readonly CatalogMatch[]): CatalogCity[] {
  const best = Math.max(0, ...matches.map(({ similarity }) => similarity));
  if (best < minCitySimilarity) return [];

  const byCity = new Map<string, { province: string; city: string; matches: CatalogMatch[] }>();
  for (const match of [...matches].sort((left, right) => right.similarity - left.similarity)) {
    const key = `${match.province}|${match.city}`;
    const entry = byCity.get(key) ?? { province: match.province, city: match.city, matches: [] };
    if (entry.matches.length < matchesPerCity) entry.matches.push(match);
    byCity.set(key, entry);
  }
  return [...byCity.values()]
    .map(({ province, city, matches: cityMatches }) => ({
      province,
      city,
      score: Math.round(cityMatches.reduce((sum, { similarity }, index) => sum + similarity * matchWeights[index], 0) * 1000) / 1000,
      matches: cityMatches.map(({ name, kind, summary }) => ({ name, kind, summary })),
    }))
    .sort((left, right) => right.score - left.score || left.city.localeCompare(right.city, "zh"))
    .slice(0, maxCatalogCities);
}
