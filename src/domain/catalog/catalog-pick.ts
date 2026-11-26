import { normalizeRecommendationName } from "@/domain/location/recommendation-identity";

import type { CatalogEntry } from "./catalog-entry";
import type { CatalogTag } from "./catalog-tags";

/**
 * How research uses Meri's catalog (RAG step 2, agreed with merlin 2026-11-25): a city with at
 * least this many catalog spots takes its candidates from the catalog and skips the web
 * discovery; fewer, or none, keeps the Kimi search path.
 */
export const minCatalogSpots = 6;
/** Catalog dishes replace the dish search only when the city has this many (What to eat). */
export const minCatalogDishes = 3;

/** One catalog spot as research reads it. */
export type CatalogSpot = {
  readonly id: string;
  readonly name: string;
  readonly aliases: readonly string[];
  readonly county: string | null;
  readonly summary: string;
  readonly highlights: readonly string[];
  readonly tags: readonly CatalogTag[];
  readonly sourceCount: number;
  readonly confidence: CatalogEntry["confidence"];
};

/** One catalog dish as What to eat reads it. */
export type CatalogDish = {
  readonly id: string;
  readonly name: string;
  readonly summary: string;
  readonly sourceCount: number;
};

export type CityCatalog = { readonly spots: readonly CatalogSpot[]; readonly dishes: readonly CatalogDish[] };

const outdoorTags: ReadonlySet<CatalogTag> = new Set<CatalogTag>([
  "山地", "水域", "海滨", "地貌", "森林草原", "自然", "乡村", "徒步", "水上活动", "冰雪", "观景",
]);
const indoorTags: ReadonlySet<CatalogTag> = new Set<CatalogTag>(["展馆"]);

/**
 * Outdoors from the fixed tags, for keeping stops off poor-weather days: true with an outdoor
 * tag and no indoor one, false with only indoor ones, null otherwise (caves, temples, culture).
 */
export function catalogOutdoor(tags: readonly CatalogTag[]): boolean | null {
  const outdoor = tags.some((tag) => outdoorTags.has(tag));
  const indoor = tags.some((tag) => indoorTags.has(tag));
  if (outdoor && !indoor) return true;
  if (indoor && !outdoor) return false;
  return null;
}

const confidenceRank: Record<CatalogEntry["confidence"], number> = { high: 0, medium: 1, low: 2 };

/** Reciprocal rank fusion's constant (agreed 2026-11-25): a lower rank always helps, never by much. */
export const rrfK = 60;

/**
 * Reciprocal rank fusion: each list adds 1 / (k + rank) to an id, rank counted from 1, so an id high
 * in several lists beats one at the top of a single list. Lists are best first.
 */
export function fuseRankings(lists: readonly (readonly string[])[], k = rrfK): Map<string, number> {
  const scores = new Map<string, number>();
  for (const list of lists) {
    list.forEach((id, index) => scores.set(id, (scores.get(id) ?? 0) + 1 / (k + index + 1)));
  }
  return scores;
}

/**
 * How a city's spots answer the traveller's preferences (RAG step 3): by meaning (vector, top 50)
 * and by the names they wrote (keyword, top 20). Either may be empty.
 */
export type PreferenceRankings = { readonly vector: readonly string[]; readonly keyword: readonly string[] };

/** More guides first, then the surer entries, then by name so a run is repeatable. */
function byPopularity(left: CatalogSpot, right: CatalogSpot): number {
  return right.sourceCount - left.sourceCount
    || confidenceRank[left.confidence] - confidenceRank[right.confidence]
    || left.name.localeCompare(right.name, "zh");
}

/** Takes from each list in turn, best first, skipping what an earlier turn already took. */
export function interleave(lists: readonly (readonly string[])[]): string[] {
  const taken = new Set<string>();
  const order: string[] = [];
  const longest = Math.max(0, ...lists.map((list) => list.length));
  for (let index = 0; index < longest; index += 1) {
    for (const list of lists) {
      const id = list[index];
      if (id !== undefined && !taken.has(id)) {
        taken.add(id);
        order.push(id);
      }
    }
  }
  return order;
}

/**
 * The order candidates are taken in. Spots in a county the traveller named (such as 大理市) come
 * first. Without preference rankings the rest follow popularity. With them, the vector and keyword
 * lists are fused (RRF) into a preference order, which then takes turns with popularity: the spot
 * that best answers the preferences, the most-mentioned spot, the next of each, and so on.
 *
 * Taking turns, not a third RRF list: on 2026-11-26 popularity fused as a third list left 玉龙雪山
 * (first for 雪山) out of 丽江's top four. A city has only a few dozen spots, so with k = 60 a spot
 * in the middle of two lists outscored the top of one.
 */
export function rankCatalogSpots(
  spots: readonly CatalogSpot[],
  areas: readonly string[],
  rankings: PreferenceRankings | null = null,
): CatalogSpot[] {
  const popular = [...spots].sort(byPopularity);
  const byId = new Map(popular.map((spot) => [spot.id, spot]));
  const preference = rankings
    ? [...fuseRankings([rankings.vector, rankings.keyword])].sort((left, right) => right[1] - left[1]).map(([id]) => id).filter((id) => byId.has(id))
    : [];
  const order = interleave([preference, popular.map(({ id }) => id)]).flatMap((id) => byId.get(id) ?? []);
  const preferred = (spot: CatalogSpot) => (spot.county !== null && areas.includes(spot.county) ? 0 : 1);
  // A stable sort keeps the order above within each group.
  return order.sort((left, right) => preferred(left) - preferred(right));
}

/** The catalog spot a traveller's own name means: its name or an alias, normalised the way cards are. */
export function findCatalogSpot(spots: readonly CatalogSpot[], name: string): CatalogSpot | null {
  const key = normalizeRecommendationName(name);
  if (!key) return null;
  return spots.find((spot) =>
    [spot.name, ...spot.aliases].some((known) => normalizeRecommendationName(known) === key)) ?? null;
}
