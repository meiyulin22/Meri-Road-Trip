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

/**
 * The order candidates are taken in: spots in a county the traveller named first (such as 大理市),
 * then the ones more guides mention, then the surer ones, then by name so a run is repeatable.
 */
export function rankCatalogSpots(spots: readonly CatalogSpot[], areas: readonly string[]): CatalogSpot[] {
  const preferred = (spot: CatalogSpot) => (spot.county !== null && areas.includes(spot.county) ? 0 : 1);
  return [...spots].sort((left, right) =>
    preferred(left) - preferred(right)
    || right.sourceCount - left.sourceCount
    || confidenceRank[left.confidence] - confidenceRank[right.confidence]
    || left.name.localeCompare(right.name, "zh"));
}

/** The catalog spot a traveller's own name means: its name or an alias, normalised the way cards are. */
export function findCatalogSpot(spots: readonly CatalogSpot[], name: string): CatalogSpot | null {
  const key = normalizeRecommendationName(name);
  if (!key) return null;
  return spots.find((spot) =>
    [spot.name, ...spot.aliases].some((known) => normalizeRecommendationName(known) === key)) ?? null;
}
