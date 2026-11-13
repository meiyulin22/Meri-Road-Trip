import { namesSamePlace } from "@/capabilities/destination/resolve-destination-place";
import type { LocationCandidate } from "@/domain/location/location";
import { normalizeRecommendationName } from "@/domain/location/recommendation-identity";
import type { CityResearch, SpotCard, SpotMapCheck } from "@/domain/plan/spot-card";
import type { LocationSearchResult } from "@/platform/location-provider/location-provider";
import { logger } from "@/platform/observability/logger";
import type { RememberedSpotLocation } from "@/platform/tianditu/spot-location-memory";

/** Enough for about four days in one city; the rest stay unchecked rather than wait. */
const maxChecksPerCity = 12;

type MapCheckDependencies = {
  /** One Tianditu lookup, with the trip's province and 市 as hints. It must not retry. */
  readonly search: (name: string, areas: readonly string[]) => Promise<LocationSearchResult>;
  readonly memory: {
    get(key: string): RememberedSpotLocation | null;
    set(key: string, location: RememberedSpotLocation): void;
  };
};

export type MapCheckOutcome = {
  readonly cities: CityResearch[];
  readonly status: "complete" | "stopped";
  readonly lookups: number;
};

function inCity(candidate: LocationCandidate, card: SpotCard): boolean {
  if (candidate.province !== card.province) return false;
  // A municipality files its places with no 市 of its own, under the province's name.
  return candidate.city === card.city || (candidate.city === null && card.province === card.city);
}

/**
 * Where Tianditu puts this spot inside the spot's own 市, or not_located. The name must be
 * the spot's own, allowing its administrative or scenic-area suffix (玉龙雪山风景区), so a
 * same-named place in another province (甘肃 has an 洱海 too) never counts.
 */
export function locateSpot(card: SpotCard, candidates: readonly LocationCandidate[]): RememberedSpotLocation {
  const named = candidates.filter((candidate) => namesSamePlace(candidate.name, card.name, candidate));
  const match = named.find((candidate) => inCity(candidate, card));
  if (match) return { status: "located", district: match.district, mapName: match.name };
  if (named.length > 0) {
    // Research checks the 市 against its source, so this should be rare; record it to see.
    logger.info({ spot: card.name, city: card.city, elsewhere: named.slice(0, 3).map(({ city }) => city) },
      "Tianditu found a spot only outside its city");
  }
  return { status: "not_located" };
}

function asMapCheck(location: RememberedSpotLocation): SpotMapCheck {
  return location.status === "located" ? { status: "located", district: location.district } : { status: "not_located" };
}

/**
 * Checks the sourced spot cards on Tianditu, one lookup per spot not already remembered.
 * The first failed lookup stops the check for the whole plan: no retry, and every spot
 * still waiting stays unchecked. The plan goes on either way.
 */
export async function checkSpotsOnMap(
  cities: readonly CityResearch[],
  deps: MapCheckDependencies,
): Promise<MapCheckOutcome> {
  let stopped = false;
  let lookups = 0;
  const checked: CityResearch[] = [];
  for (const city of cities) {
    const spots: SpotCard[] = [];
    let considered = 0;
    for (const card of city.spots) {
      // Only cards a search already supports, and only so many per city.
      if (city.status === "deferred" || card.location === null || considered >= maxChecksPerCity) {
        spots.push(card);
        continue;
      }
      considered += 1;
      const key = [card.province, card.city, normalizeRecommendationName(card.name)].join("|");
      const remembered = deps.memory.get(key);
      if (remembered) {
        spots.push({ ...card, mapCheck: asMapCheck(remembered) });
        continue;
      }
      if (stopped) {
        spots.push(card);
        continue;
      }
      lookups += 1;
      const result = await deps.search(card.name, [card.province, card.city]);
      if (result.status === "failure") {
        stopped = true;
        logger.warn({ spot: card.name, city: card.city, reason: result.reason, lookups },
          "Tianditu spot check stopped at a failed lookup");
        spots.push(card);
        continue;
      }
      const location = locateSpot(card, result.candidates);
      deps.memory.set(key, location);
      spots.push({ ...card, mapCheck: asMapCheck(location) });
    }
    checked.push({ ...city, spots });
  }
  return { cities: checked, status: stopped ? "stopped" : "complete", lookups };
}
