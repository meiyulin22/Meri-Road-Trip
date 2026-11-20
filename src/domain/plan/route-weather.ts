import { exactUpTo, maxDetourRatio, pathKm, permutations, shortestOrder } from "./route-distance";
import type { GeoPoint } from "./weather";

/**
 * Distance first, weather second (1.2117, agreed 2026-11-20): among the orders of the routed
 * cities no more than 30% longer than the shortest, the one with the fewest poor-weather days.
 * Each city keeps the days the Plan Agent gave it, and its days take the trip's dates in order;
 * a transfer day counts like any other. A city's poor dates are those its own weather (the forecast
 * most of its spots share) rates poor for outdoors.
 */

export type RouteCityDays = { readonly city: string; readonly days: number };

/** A city and the trip date it meets with poor weather. */
export type PoorDay = { readonly city: string; readonly date: string };

/** The poor-weather days an order meets: each city's days on its dates, in order. */
export function poorDaysOn(
  order: readonly RouteCityDays[],
  dates: readonly (string | null)[],
  poorDates: ReadonlyMap<string, ReadonlySet<string>>,
): PoorDay[] {
  const met: PoorDay[] = [];
  let index = 0;
  for (const { city, days } of order) {
    for (let day = 0; day < days; day += 1) {
      const date = dates[index];
      index += 1;
      if (date && poorDates.get(city)?.has(date)) met.push({ city, date });
    }
  }
  return met;
}

export type OrderScore = { readonly order: readonly string[]; readonly km: number; readonly poor: readonly PoorDay[] };

export type RouteChoice = {
  readonly current: OrderScore;
  readonly shortestKm: number;
  /** The route runs more than 30% (and 5 km) longer than the shortest order. */
  readonly tooLong: boolean;
  /** The order within 30% of the shortest with the fewest poor days, then the shortest, then the current one. */
  readonly best: OrderScore;
};

/**
 * The Plan Agent's order measured against every other order of the same cities, or null when it
 * cannot be measured: fewer than two cities, or a city without a known centre. Above eight cities
 * only the shortest order found is compared.
 */
export function routeChoice(
  cities: readonly RouteCityDays[],
  dates: readonly (string | null)[],
  poorDates: ReadonlyMap<string, ReadonlySet<string>>,
  points: ReadonlyMap<string, GeoPoint>,
  origin: GeoPoint | null,
): RouteChoice | null {
  if (cities.length < 2) return null;
  const stops = cities.map(({ city }) => points.get(city));
  if (stops.some((point) => point === undefined)) return null;
  const known = stops as GeoPoint[];
  const score = (indexes: readonly number[]): OrderScore => {
    const ordered = indexes.map((index) => cities[index]);
    return {
      order: ordered.map(({ city }) => city),
      km: pathKm(indexes.map((index) => known[index]), origin),
      poor: poorDaysOn(ordered, dates, poorDates),
    };
  };
  const identity = cities.map((_, index) => index);
  const current = score(identity);
  const shortest = shortestOrder(known, origin);
  // A few kilometres over is rounding, not a detour, as for the route itself.
  const within = (km: number) => km <= shortest.km * maxDetourRatio || km - shortest.km <= 5;
  const candidates = (cities.length <= exactUpTo ? permutations(cities.length) : [shortest.order])
    .map(score).filter(({ km }) => within(km));
  let best: OrderScore = within(current.km) ? current : score(shortest.order);
  for (const candidate of candidates) {
    const fewer = candidate.poor.length < best.poor.length;
    const asFewAndShorter = candidate.poor.length === best.poor.length && candidate.km < best.km - 1e-9;
    // The current order keeps a tie: code moves the Plan Agent's route only for a real gain.
    if (fewer || (asFewAndShorter && best !== current)) best = candidate;
  }
  return {
    current: { ...current, km: Math.round(current.km) },
    shortestKm: Math.round(shortest.km),
    tooLong: !within(current.km),
    best: { ...best, km: Math.round(best.km) },
  };
}
