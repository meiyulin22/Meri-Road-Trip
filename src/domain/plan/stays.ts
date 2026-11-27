import { type DriveLeg, legReach, type PlanDay } from "./plan-draft";
import type { SpotCard } from "./spot-card";
import { type GeoPoint, kmBetween } from "./weather";

/**
 * Where to stay (agreed 2026-11-20): one hotel a city stay, near the middle of that stay's spots.
 * Code shows three tiers from what the hotel search returns; when the traveller's preferences
 * bear on lodging, the Plan Agent also marks the one it finds best, from the same list. Prices
 * are reference rates, never a booking; no booking link is shown.
 */

/** One hotel as the search returns it, in Meri's words. */
export type HotelOption = {
  readonly id: number;
  readonly name: string;
  readonly brand: string | null;
  readonly address: string;
  /** WGS-84, as the provider gives it. */
  readonly point: GeoPoint;
  readonly star: number | null;
  /** From the place searched near; null when the provider does not say. */
  readonly distanceM: number | null;
  /** The lowest reference rate a night, not a live price. */
  readonly pricePerNight: { readonly amount: number; readonly currency: string } | null;
  readonly image: string | null;
  readonly tags: readonly string[];
  readonly amenities: readonly string[];
};

/** What a hotel's own page says, read for the hotels the plan shows. */
export type HotelDetail = {
  readonly phone: string | null;
  readonly district: string | null;
  readonly checkIn: string | null;
  readonly checkOut: string | null;
  readonly facilities: readonly string[];
  readonly images: readonly string[];
};

export const stayTiers = ["budget", "comfort", "luxury"] as const;
export type StayTier = (typeof stayTiers)[number];

export type StayPick = { readonly hotel: HotelOption; readonly detail: HotelDetail | null };

/** A run of nights in one city, from the days of the plan. */
export type StayBlock = {
  readonly province: string;
  readonly city: string;
  /** The day the stay begins, and its date. */
  readonly firstDay: number;
  readonly checkIn: string;
  readonly nights: number;
  /** The last day of the stay in the city, for the page to place the card after. */
  readonly lastDay: number;
  /** What to search near: the stop in the middle of the stay's located stops, or the city itself. */
  readonly near: {
    readonly name: string;
    readonly kind: "spot" | "city";
    /** The guides' stay area searched in instead of the middle stop (RAG step 5), absent when none fit. */
    readonly area?: StayAreaNote;
  };
  /** Other parts of the city the guides recommend staying in, named only (RAG step 5); absent when none. */
  readonly otherAreas?: readonly StayAreaNote[];
};

export type StayAreaNote = { readonly name: string; readonly features: readonly string[] };

/** A stay area from the catalog placed on the map by the spot it sits by (RAG step 5). */
export type StayAreaPoint = StayAreaNote & { readonly spotName: string; readonly point: GeoPoint };

/** A stay area further than this from the middle of the stay's stops is not worth the drive back each night. */
export const maxStayAreaKm = 15;
const maxOtherAreas = 2;

export type CityStay = StayBlock & (
  | {
    readonly status: "found";
    readonly tiers: readonly ({ readonly tier: StayTier } & StayPick)[];
    /** The Plan Agent's pick for the traveller's preferences, with why; null without such preferences. */
    readonly recommended: (StayPick & { readonly reason: string }) | null;
    readonly checkedAt: string;
  }
  | { readonly status: "none" }
  | { readonly status: "unavailable" }
);

/**
 * The nights of the trip by city: consecutive days in one city make one stay, every day a night
 * except the last day of the trip, which is spent going home (merlin, 2026-11-20). Days without
 * a date make no stay.
 */
export function stayBlocks(
  days: readonly PlanDay[],
  cards: ReadonlyMap<string, SpotCard>,
  bigAreas: ReadonlySet<string> = new Set(),
  /** The guides' stay areas by "province|city" (RAG step 5); none, and the middle stop is searched near. */
  stayAreas: ReadonlyMap<string, readonly StayAreaPoint[]> = new Map(),
): StayBlock[] {
  const sorted = [...days].sort((left, right) => left.day - right.day);
  const lastDay = sorted.at(-1)?.day ?? 0;
  const blocks: StayBlock[] = [];
  let index = 0;
  while (index < sorted.length) {
    const first = sorted[index];
    let end = index;
    while (end + 1 < sorted.length && sorted[end + 1].city === first.city && sorted[end + 1].province === first.province) end += 1;
    const run = sorted.slice(index, end + 1);
    index = end + 1;
    const nights = run.filter(({ day }) => day !== lastDay).length;
    if (nights === 0 || first.date === null) continue;
    blocks.push({
      province: first.province, city: first.city, firstDay: first.day, checkIn: first.date, nights,
      lastDay: run.at(-1)?.day ?? first.day,
      ...stayNear(run, cards, first.city, bigAreas, stayAreas.get(`${first.province}|${first.city}`) ?? []),
    });
  }
  return blocks;
}

/**
 * Where to search a stay (RAG step 5): the guides' stay area nearest the middle of the stay's located
 * stops, within 15 km, else the middle stop as before. The other areas are named on the card. A stop
 * the plan merely passes, such as a temple in the middle, is a poorer base than an old town nearby.
 */
export function stayNear(
  run: readonly PlanDay[],
  cards: ReadonlyMap<string, SpotCard>,
  city: string,
  bigAreas: ReadonlySet<string>,
  areas: readonly StayAreaPoint[],
): Pick<StayBlock, "near" | "otherAreas"> {
  const fallback = nearOf(run, cards, city, bigAreas);
  const points = run.flatMap(({ stops }) => stops).flatMap(({ spotId }) => {
    const card = cards.get(spotId);
    return card && !bigAreas.has(spotId) && card.mapCheck.status === "located" && card.mapCheck.point ? [card.mapCheck.point] : [];
  });
  const middle = points.length > 0
    ? { longitude: points.reduce((sum, { longitude }) => sum + longitude, 0) / points.length,
      latitude: points.reduce((sum, { latitude }) => sum + latitude, 0) / points.length }
    : null;
  const nearest = middle
    ? [...areas].sort((left, right) => kmBetween(middle, left.point) - kmBetween(middle, right.point))
      .find((area) => kmBetween(middle, area.point) <= maxStayAreaKm) ?? null
    : null;
  const note = ({ name, features }: StayAreaNote) => ({ name, features: [...features] });
  const others = areas.filter((area) => area !== nearest).slice(0, maxOtherAreas).map(note);
  return {
    near: nearest ? { name: nearest.spotName, kind: "spot", area: note(nearest) } : fallback,
    ...(others.length ? { otherAreas: others } : {}),
  };
}

/** The located stop with the shortest total distance to the others; the city when none is located. */
export function nearOf(
  run: readonly PlanDay[],
  cards: ReadonlyMap<string, SpotCard>,
  city: string,
  /** Stops that are large areas, such as a lake, never searched near; from `bigAreaStops`. */
  bigAreas: ReadonlySet<string> = new Set(),
): StayBlock["near"] {
  const located = run.flatMap(({ stops }) => stops).flatMap(({ spotId }) => {
    const card = cards.get(spotId);
    return card && !bigAreas.has(spotId) && card.mapCheck.status === "located" && card.mapCheck.point ? [{ name: card.name, point: card.mapCheck.point }] : [];
  });
  if (located.length === 0) return { name: city, kind: "city" };
  const total = (point: GeoPoint) => located.reduce((sum, other) => sum + kmBetween(point, other.point), 0);
  const middle = located.reduce((best, stop) => (total(stop.point) < total(best.point) ? stop : best));
  return { name: middle.name, kind: "spot" };
}

/**
 * Stops the drive legs found to be large areas, more than a kilometre from any road (1.2105):
 * a lake such as 洱海, whose point sits mid-lake. Searching hotels or food "near" one measured
 * from that point (2026-11-21: 大理's hotels read 5 to 20 km from 洱海), so they are skipped.
 */
export function bigAreaStops(legs: readonly DriveLeg[]): Set<string> {
  const areas = new Set<string>();
  for (const leg of legs) {
    const reach = legReach(leg);
    if (reach.kind !== "area") continue;
    if (reach.fromIsArea) areas.add(leg.fromSpotId);
    if (reach.toIsArea) areas.add(leg.toSpotId);
  }
  return areas;
}

const tierOf = (star: number | null): StayTier => (star === null || star <= 2 ? "budget" : star >= 5 ? "luxury" : "comfort");

/**
 * One hotel a tier: within it, the nearest with a price, then the nearest at all. A tier the
 * search has nothing for stays empty.
 */
export function pickTiers(hotels: readonly HotelOption[]): { readonly tier: StayTier; readonly hotel: HotelOption }[] {
  return stayTiers.flatMap((tier) => {
    const inTier = hotels.filter((hotel) => tierOf(hotel.star) === tier);
    if (inTier.length === 0) return [];
    const byDistance = (left: HotelOption, right: HotelOption) => (left.distanceM ?? Infinity) - (right.distanceM ?? Infinity);
    const priced = inTier.filter((hotel) => hotel.pricePerNight !== null).sort(byDistance);
    return [{ tier, hotel: priced[0] ?? [...inTier].sort(byDistance)[0] }];
  });
}

/** Preferences about money, company, walking or things to avoid bear on where to sleep. */
export const lodgingPreferenceKinds = ["budget", "companions", "walking", "avoid"] as const;

export const maxStayReasonLength = 80;
