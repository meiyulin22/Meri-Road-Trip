import { z } from "zod";

import { type CatalogSpot, fuseRankings, type PreferenceRankings, rankCatalogSpots } from "@/domain/catalog/catalog-pick";

/** One retrieval case: a city, the traveller's own words, and the catalog spots that should come first. */
export const retrievalCaseSchema = z.strictObject({
  id: z.string().min(1),
  province: z.string().min(1),
  city: z.string().min(1),
  query: z.string().min(1),
  relevant: z.array(z.string().min(1)).min(1),
});
export type RetrievalCase = z.infer<typeof retrievalCaseSchema>;

export const retrievalCasesSchema = z.strictObject({ note: z.string(), cases: z.array(retrievalCaseSchema).min(1) });

/** The orders compared: popularity (step 2), vector alone, the preference order, and what research uses. */
export const rankers = ["popularity", "vector", "preference", "interleave"] as const;
export type Ranker = (typeof rankers)[number];

/** Ids best first; spots a list leaves out follow in popularity order, as research would take them. */
export function rankBy(ranker: Ranker, spots: readonly CatalogSpot[], rankings: PreferenceRankings): string[] {
  const popularity = rankCatalogSpots(spots, []).map(({ id }) => id);
  const known = new Set(popularity);
  const withRest = (first: readonly string[]) => {
    const head = first.filter((id) => known.has(id));
    const taken = new Set(head);
    return [...head, ...popularity.filter((id) => !taken.has(id))];
  };
  switch (ranker) {
    case "popularity": return popularity;
    case "vector": return withRest(rankings.vector);
    case "preference":
      return withRest([...fuseRankings([rankings.vector, rankings.keyword])].sort((left, right) => right[1] - left[1]).map(([id]) => id));
    case "interleave": return rankCatalogSpots(spots, [], rankings).map(({ id }) => id);
  }
}

export type CaseScore = { readonly hitAt4: boolean; readonly recallAt4: number; readonly recallAt12: number; readonly top4: readonly string[] };

/** hit@4: any relevant spot in the first four; recall@k: the share of relevant spots in the first k. */
export function scoreOrder(order: readonly string[], relevantIds: readonly string[], nameOf: (id: string) => string): CaseScore {
  const within = (k: number) => relevantIds.filter((id) => order.slice(0, k).includes(id)).length;
  return {
    hitAt4: within(4) > 0,
    recallAt4: within(4) / relevantIds.length,
    recallAt12: within(12) / relevantIds.length,
    top4: order.slice(0, 4).map(nameOf),
  };
}

export type RankerTotals = { readonly hitAt4: number; readonly recallAt4: number; readonly recallAt12: number };

/** Means over the cases, rounded to three places. */
export function totals(scores: readonly CaseScore[]): RankerTotals {
  const mean = (values: readonly number[]) => Math.round((values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1)) * 1000) / 1000;
  return {
    hitAt4: mean(scores.map(({ hitAt4 }) => (hitAt4 ? 1 : 0))),
    recallAt4: mean(scores.map(({ recallAt4 }) => recallAt4)),
    recallAt12: mean(scores.map(({ recallAt12 }) => recallAt12)),
  };
}

/** One city case (RAG step 4): what a traveller said, and the cities that should come first; none means the catalog should stay silent. */
export const cityCaseSchema = z.strictObject({ id: z.string().min(1), query: z.string().min(1), cities: z.array(z.string().min(1)) });
export const cityCasesSchema = z.strictObject({ note: z.string(), cases: z.array(cityCaseSchema).min(1) });

export type CityCaseScore = { readonly passed: boolean; readonly recallAt4: number | null; readonly top4: readonly string[] };

/**
 * A silent case passes when the catalog suggests nothing; any other passes when one expected city is
 * in the first four, and also reports what share of them are.
 */
export function scoreCityCase(expected: readonly string[], suggested: readonly string[] | null): CityCaseScore {
  const top4 = (suggested ?? []).slice(0, 4);
  if (expected.length === 0) return { passed: top4.length === 0, recallAt4: null, top4 };
  const found = expected.filter((city) => top4.includes(city)).length;
  return { passed: found > 0, recallAt4: found / expected.length, top4 };
}
