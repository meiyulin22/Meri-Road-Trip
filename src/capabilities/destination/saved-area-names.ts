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
