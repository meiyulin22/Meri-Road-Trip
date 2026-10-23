import type { TripState } from "@/domain/trip-state/trip-state";

/**
 * The province and 市 names the trip already holds — the prior a provider may narrow its
 * search by. Spots are left out: a spot is filed under its city, so the city's own page
 * already covers it, and a long list would only spend requests.
 */
export function savedAreaNames(state: TripState): readonly string[] {
  if (state.destination.state !== "known") return [];
  const names: string[] = [];
  for (const area of state.destination.areas) {
    names.push(area.province);
    for (const place of area.places) names.push(place.name);
  }
  return [...new Set(names)];
}

/**
 * The 市 and prefectures only. A Journey that holds nothing but a province is the common
 * early state ("我想去云南"), and a province is too wide to narrow a same-named place — the
 * model hint is what turns that state into a usable prior.
 */
export function savedCityNames(state: TripState): readonly string[] {
  if (state.destination.state !== "known") return [];
  return [...new Set(state.destination.areas.flatMap((area) => area.places.map((place) => place.name)))];
}
