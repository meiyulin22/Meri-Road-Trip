import type { TripState } from "@/domain/trip-state/trip-state";
import { formatExactDate, parseExactDate, parseExactDays } from "@/domain/trip-state/trip-dates";

import type { SpotCard, SpotEvidence } from "./spot-card";
import type { DayOutfit } from "./outfit";
import type { CityFood } from "./food";
import type { CityStay } from "./stays";
import type { TransferLeg } from "./transfer-legs";

export const daySlots = ["morning", "afternoon", "evening"] as const;
export type DaySlot = (typeof daySlots)[number];

/** A few visits fit in a day when the transport is not known yet. */
export const maxStopsPerDay = 4;

export const spotFacts = ["location", "opening", "reservation", "setting", "walking", "suggestedDuration"] as const;
export type SpotFact = (typeof spotFacts)[number];

/** A clock time a spot itself requires, such as a last cable car, shown only with its source. */
export type TimeAnchor = {
  readonly time: string;
  readonly reason: string;
  readonly evidence: SpotEvidence;
};

export type PlanStop = {
  readonly spotId: string;
  readonly slot: DaySlot;
  readonly anchor: TimeAnchor | null;
};

/** Where one day of the trip is, before any spot is chosen. */
export type DayFrame = {
  readonly day: number;
  readonly date: string | null;
  readonly province: string;
  readonly city: string;
  /** The city left that morning: a transfer day, lighter, with the travel time still unknown. */
  readonly arrivingFrom: string | null;
  /** The district the day mostly spends in, one the map located spots in. */
  readonly focus: string | null;
  /** A short theme for the day, Meri's suggestion. */
  readonly theme: string | null;
};

export type PlanDay = DayFrame & { readonly stops: readonly PlanStop[] };

export type PlanConflict =
  | { readonly kind: "requested_unscheduled"; readonly spotId: string }
  | { readonly kind: "not_enough_candidates"; readonly day: number }
  /** A spot the traveller named is closed on every day its city could take it (1.2013). */
  | { readonly kind: "closed_on_day"; readonly day: number; readonly spotId: string };

/** What the second round decided for one scheduled stop, and whether it was moved there. */
export type StopCheck = {
  readonly day: number;
  readonly spotId: string;
  readonly status: "open" | "partial" | "closed" | "uncertain" | "unchecked";
  readonly reservation: { readonly daysAhead: number | null } | null;
  readonly movedFrom: number | null;
};

/** Two stops closer than this are walked rather than driven (1.2103). */
export const walkWithinKm = 1.2;
/** An off-road stretch longer than this is shown: the road stops short of the stop. */
export const offRoadNoticeMeters = 300;
/**
 * An end farther than this from any road is not a point but a large area, such as a lake or a
 * mountain range (1.2105): Tianditu put 洱海 mid-lake, so 洱海 → 南诏风情岛 read 54 km with the
 * first 1.7 km off road. The time then depends on where the traveller actually starts and is
 * not given.
 */
export const bigAreaMeters = 1000;

/**
 * Getting between two stops next to each other in one day, as Tianditu planned it (1.2102):
 * on foot or by road, how far and how long, and the way's points for the map. `none` is a
 * pair Tianditu found no way between, such as an island; its path is the straight line.
 */
export type DriveLeg = {
  readonly day: number;
  readonly fromSpotId: string;
  readonly toSpotId: string;
  /** Absent on plans made in 1.2102, which all drove. */
  readonly mode?: "walk" | "drive" | "none";
  readonly distanceKm: number;
  /** 0 when the mode is none. */
  readonly durationMinutes: number;
  /** Longitude, latitude pairs along the way, at most 200. */
  readonly path: readonly (readonly [number, number])[];
  /** The straight stretches at either end where the map has no road (1.2103). */
  readonly offRoadStartMeters?: number;
  readonly offRoadEndMeters?: number;
};

/**
 * How far a leg's time can be trusted, decided from what Tianditu measured (1.2105): no way at
 * all; an end that is a large area, so no time; or a way whose ends may stop short of a stop by
 * a stretch worth saying (0 when it does not). Plans saved before 1.2103 have no off-road
 * measures and read as reaching both stops.
 */
export type LegReach =
  | { readonly kind: "none" }
  | { readonly kind: "area"; readonly fromIsArea: boolean; readonly toIsArea: boolean }
  | { readonly kind: "way"; readonly startGapMeters: number; readonly endGapMeters: number };

export function legReach(leg: DriveLeg): LegReach {
  if (leg.mode === "none") return { kind: "none" };
  const start = leg.offRoadStartMeters ?? 0;
  const end = leg.offRoadEndMeters ?? 0;
  if (start > bigAreaMeters || end > bigAreaMeters) {
    return { kind: "area", fromIsArea: start > bigAreaMeters, toIsArea: end > bigAreaMeters };
  }
  return {
    kind: "way",
    startGapMeters: start > offRoadNoticeMeters ? start : 0,
    endGapMeters: end > offRoadNoticeMeters ? end : 0,
  };
}

export type PlanMode = "preview" | "full";

export type RouteCity = {
  readonly province: string;
  readonly city: string;
  readonly days: number;
  /** Why this many days, in the Plan Agent's words; null when code split the days. */
  readonly reason: string | null;
};

/** The order of the cities and their days, or why a city did not fit. */
export type PlanRoute = {
  readonly source: "agent" | "fallback";
  readonly cities: readonly RouteCity[];
  readonly omitted: readonly { readonly province: string; readonly city: string; readonly reason: string | null }[];
};

export type PlanDraft = {
  readonly mode: PlanMode;
  readonly totalDays: number | null;
  readonly route: PlanRoute;
  readonly days: readonly PlanDay[];
  readonly conflicts: readonly PlanConflict[];
  /** Scheduled spots whose facts no source supports yet, shown as 待核实. */
  readonly unverified: readonly { readonly spotId: string; readonly fields: readonly SpotFact[] }[];
  /** The second round's verdict for each stop; absent on plans made before it (1.2013). */
  readonly checks?: readonly StopCheck[];
  /** Driving between neighbouring located stops; absent on plans made before 1.2102. */
  readonly legs?: readonly DriveLeg[];
  /** Setting off, between cities and the way back, with a rough drive time; absent before 1.2106. */
  readonly transfers?: readonly TransferLeg[];
  /** What to wear each day with a forecast (1.2117 outfit); absent before it. */
  readonly outfits?: readonly DayOutfit[];
  /** Where to stay in each city (1.2117 stays); absent before it, or when hotel search is off. */
  readonly stays?: readonly CityStay[];
  /** What to eat in each city (1.2117 food); absent before it. */
  readonly food?: readonly CityFood[];
};

export type TripCity = { readonly province: string; readonly city: string };

/** What a plan covers before the Plan Agent routes it: the cities, how many days, and their dates. */
export type PlanScope =
  | {
    readonly status: "ready";
    readonly mode: PlanMode;
    readonly totalDays: number | null;
    readonly cities: readonly TripCity[];
    readonly dates: readonly (string | null)[];
  }
  | { readonly status: "unsupported"; readonly reason: "no_city" };

const dayMs = 24 * 60 * 60 * 1000;

/**
 * A "spot" that is really a county-level area of its city, such as 大理市 under
 * 大理白族自治州 or 香格里拉市 under 迪庆藏族自治州: the traveller means "around there", not a
 * place to visit. County-level names end in 市, 县 or 旗 (自治县 and 自治旗 included). Names
 * ending in 区 are left alone, because scenic areas (玉龙雪山景区) end in 区 too.
 */
export function isAreaName(spot: string, city: string): boolean {
  const name = spot.trim();
  return name !== city && name.length >= 2 && /(市|县|旗)$/u.test(name);
}

/** A city's selected spots split into places to visit and areas the traveller named. */
export function splitRequested(spots: readonly string[], city: string): { spots: string[]; areas: string[] } {
  return {
    spots: spots.filter((spot) => !isAreaName(spot, city)),
    areas: spots.filter((spot) => isAreaName(spot, city)),
  };
}

/**
 * Without a confirmed duration, one preview day in the first selected city; the rest stay
 * locked. With one, every selected city across every day, for the Plan Agent to route.
 */
export function planScope(tripState: TripState): PlanScope {
  const destination = tripState.destination;
  const cities = destination.state === "known"
    ? destination.areas.flatMap(({ province, places }) => places.map(({ name }) => ({ province, city: name })))
    : [];
  if (cities.length === 0) return { status: "unsupported", reason: "no_city" };

  const totalDays = parseExactDays(tripState.duration);
  const start = parseExactDate(tripState.startDate);
  const dates = Array.from({ length: totalDays ?? 1 }, (_, index) =>
    start === null ? null : formatExactDate(start + index * dayMs));
  return {
    status: "ready",
    mode: totalDays === null ? "preview" : "full",
    totalDays,
    cities: totalDays === null ? cities.slice(0, 1) : cities,
    dates,
  };
}

/** What the Plan Agent proposes for the route, by the short city IDs it was given. */
export type RouteProposal = {
  /** A reason can be missing: the model sometimes leaves it empty, which does not make the route wrong. */
  readonly cities: readonly { readonly id: string; readonly days: number; readonly reason: string | null }[];
  readonly days: readonly { readonly day: number; readonly focus: string | null; readonly theme: string | null }[];
  readonly omitted: readonly { readonly id: string; readonly reason: string | null }[];
};

/** A city as the Plan Agent sees it: a short ID, how many candidates research found, and their districts. */
export type RouteCityInput = TripCity & {
  readonly id: string;
  readonly candidates: number;
  readonly districts: readonly string[];
};

export type RoutedPlan = { readonly route: PlanRoute; readonly frames: readonly DayFrame[] };

/** Days laid out city after city; the first day in each later city is a transfer day. */
function framesFor(
  cities: readonly (TripCity & { readonly days: number })[],
  dates: readonly (string | null)[],
  dayDetails: ReadonlyMap<number, { readonly focus: string | null; readonly theme: string | null }> = new Map(),
): DayFrame[] {
  const frames: DayFrame[] = [];
  cities.forEach((city, cityIndex) => {
    for (let index = 0; index < city.days; index += 1) {
      const day = frames.length + 1;
      frames.push({
        day, date: dates[day - 1] ?? null, province: city.province, city: city.city,
        arrivingFrom: cityIndex > 0 && index === 0 ? cities[cityIndex - 1].city : null,
        focus: dayDetails.get(day)?.focus ?? null,
        theme: dayDetails.get(day)?.theme ?? null,
      });
    }
  });
  return frames;
}

/**
 * Checks the Plan Agent's route: every city exactly once, either in the route or left out
 * with a reason, left out only when the days cannot hold every city, at least one day each,
 * the days adding up, and each day's focus a district the map found in that day's city.
 * Errors are written for the model's second attempt.
 */
export function reviewRoute(
  scope: Extract<PlanScope, { status: "ready" }>,
  cities: readonly RouteCityInput[],
  proposal: RouteProposal,
  /** City IDs the traveller chose to leave out when asked; only they may go while days remain. */
  leaveOutAllowed: ReadonlySet<string> = new Set(),
): { readonly plan: RoutedPlan | null; readonly errors: readonly string[] } {
  const errors: string[] = [];
  const byId = new Map(cities.map((city) => [city.id, city]));
  const totalDays = scope.dates.length;
  const seen = new Set<string>();
  for (const { id } of [...proposal.cities, ...proposal.omitted]) {
    if (!byId.has(id)) errors.push(`${id} is not one of the trip's cities.`);
    else if (seen.has(id)) errors.push(`${byId.get(id)?.city} appears more than once.`);
    seen.add(id);
  }
  for (const city of cities) {
    if (!seen.has(city.id)) errors.push(`${city.city} is neither routed nor left out with a reason.`);
  }
  // A city may be left out when the days cannot hold every city, or when research found
  // nothing there to plan: empty days would help no one.
  // A tight trip is the traveller's call, not the model's: with a day for every city, a city
  // goes only when the traveller chose that.
  const needlessOmissions = proposal.omitted.filter(({ id }) => (byId.get(id)?.candidates ?? 0) > 0 && !leaveOutAllowed.has(id));
  if (needlessOmissions.length > 0 && cities.length <= totalDays) {
    errors.push(`There are ${totalDays} days for ${cities.length} cities: route every city that has candidates, at least one day each, `
      + "and give any extra days to the cities that deserve them. If the trip is tight, say so in the reasons; do not leave a city out.");
  }
  if (proposal.cities.length === 0) errors.push("The route has no city.");
  if (proposal.cities.some(({ days }) => !Number.isInteger(days) || days < 1)) errors.push("Every routed city needs at least one day.");
  const sum = proposal.cities.reduce((total, { days }) => total + days, 0);
  if (sum !== totalDays) errors.push(`The routed days add up to ${sum}, not ${totalDays}.`);
  if (errors.length > 0) return { plan: null, errors };

  const routed = proposal.cities.map(({ id, days, reason }) => ({ ...(byId.get(id) as RouteCityInput), days, reason }));
  const dayDetails = new Map(proposal.days.map(({ day, focus, theme }) => [day, { focus, theme }]));
  const frames = framesFor(routed, scope.dates, dayDetails);
  for (const frame of frames) {
    const districts = routed.find(({ city }) => city === frame.city)?.districts ?? [];
    if (frame.focus !== null && !districts.includes(frame.focus)) {
      errors.push(`Day ${frame.day}: ${frame.focus} is not a district the map found in ${frame.city}.`);
    }
  }
  if (errors.length > 0) return { plan: null, errors };
  return {
    plan: {
      route: {
        source: "agent",
        cities: routed.map(({ province, city, days, reason }) => ({ province, city, days, reason })),
        omitted: proposal.omitted.map(({ id, reason }) => {
          const city = byId.get(id) as RouteCityInput;
          return { province: city.province, city: city.city, reason };
        }),
      },
      frames,
    },
    errors,
  };
}

/**
 * When the Plan Agent cannot route the trip: the cities in the order they were added, the
 * days shared as evenly as they go, earlier cities taking the extra days. With fewer days
 * than cities, the first cities keep a day each and the rest are left out.
 */
export function fallbackRoute(scope: Extract<PlanScope, { status: "ready" }>): RoutedPlan {
  const totalDays = scope.dates.length;
  const kept = scope.cities.slice(0, totalDays);
  const base = Math.floor(totalDays / kept.length);
  const extra = totalDays % kept.length;
  const routed = kept.map((city, index) => ({ ...city, days: base + (index < extra ? 1 : 0) }));
  return {
    route: {
      source: "fallback",
      cities: routed.map(({ province, city, days }) => ({ province, city, days, reason: null })),
      omitted: scope.cities.slice(totalDays).map(({ province, city }) => ({ province, city, reason: null })),
    },
    frames: framesFor(routed, scope.dates),
  };
}

/**
 * The same route with its cities in another order (1.2117), when the Plan Agent's order still ran
 * more than 30% longer than the shortest after it was sent back once. Each city keeps its days and
 * reason; each of its days keeps its focus and theme, in the same sequence, on its new day numbers
 * and dates. `order` names every routed city once.
 */
export function reorderRoute(plan: RoutedPlan, order: readonly string[], dates: readonly (string | null)[]): RoutedPlan {
  const cities = order.map((name) => {
    const city = plan.route.cities.find(({ city: routed }) => routed === name);
    if (!city) throw new Error(`Cannot reorder the route: ${name} is not routed.`);
    return city;
  });
  const details = cities.flatMap(({ city }) =>
    plan.frames.filter((frame) => frame.city === city).map(({ focus, theme }) => ({ focus, theme })));
  return {
    route: { ...plan.route, cities },
    frames: framesFor(cities, dates, new Map(details.map((detail, index) => [index + 1, detail]))),
  };
}

/** What the Plan Agent returns, before code checks it. */
export type PlanProposal = {
  readonly days: readonly {
    readonly day: number;
    readonly stops: readonly {
      readonly spotId: string;
      readonly slot: DaySlot;
      readonly anchor: { readonly time: string; readonly reason: string } | null;
    }[];
  }[];
};

export type ProposalReview = {
  readonly days: readonly PlanDay[];
  /** Problems the model can fix on a second attempt, written for the model. */
  readonly errors: readonly string[];
};

function sameCity(card: SpotCard, frame: DayFrame): boolean {
  return card.province === frame.province && card.city === frame.city;
}

/** A sourced quote that states this exact time. Sources often write 16：00 with a full-width colon. */
function anchorEvidence(card: SpotCard, time: string): SpotEvidence | null {
  if (!/^([01]?\d|2[0-3]):[0-5]\d$/u.test(time)) return null;
  for (const fact of spotFacts) {
    const evidence = card[fact];
    if (evidence?.quote.replaceAll("：", ":").includes(time)) return evidence;
  }
  return null;
}

/**
 * Keeps the parts of a proposal that hold: known spots in that day's city, each spot once,
 * and times a source states. Everything dropped is reported so the model can try again.
 */
export function reviewProposal(
  mode: PlanMode,
  frames: readonly DayFrame[],
  cards: readonly SpotCard[],
  proposal: PlanProposal,
  /** Lower for a lighter trip, such as with a walking limit or companions. */
  maxStops: number = maxStopsPerDay,
): ProposalReview {
  const errors: string[] = [];
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const used = new Set<string>();
  const proposedDays = new Map<number, PlanProposal["days"][number]>();
  for (const day of proposal.days) {
    if (!frames.some((frame) => frame.day === day.day) || proposedDays.has(day.day)) {
      errors.push(`Day ${day.day} is not a planned day or appears twice.`);
      continue;
    }
    proposedDays.set(day.day, day);
  }

  const days = frames.map((frame) => {
    const stops: PlanStop[] = [];
    for (const stop of proposedDays.get(frame.day)?.stops ?? []) {
      const card = cardsById.get(stop.spotId);
      if (!card || !sameCity(card, frame)) {
        errors.push(`Day ${frame.day}: ${card?.name ?? stop.spotId} is not a candidate in ${frame.city}.`);
        continue;
      }
      if (used.has(card.id)) {
        errors.push(`Day ${frame.day}: ${card.name} is already scheduled.`);
        continue;
      }
      // A transfer day loses a stop to the road.
      const limit = frame.arrivingFrom === null ? maxStops : Math.max(1, maxStops - 1);
      if (stops.length >= limit) {
        errors.push(`Day ${frame.day} has more than ${limit} stops.`);
        break;
      }
      // The morning of a transfer day is spent on the road.
      if (frame.arrivingFrom !== null && stop.slot === "morning") {
        errors.push(`Day ${frame.day} is a transfer day from ${frame.arrivingFrom}: ${card.name} cannot be in the morning.`);
        continue;
      }
      used.add(card.id);
      const evidence = stop.anchor ? anchorEvidence(card, stop.anchor.time) : null;
      if (stop.anchor && !evidence) errors.push(`Day ${frame.day}: no source states ${stop.anchor.time} for ${card.name}.`);
      const anchor = stop.anchor && evidence ? { ...stop.anchor, evidence } : null;
      stops.push({ spotId: card.id, slot: stop.slot, anchor });
    }
    if (stops.length === 0 && cards.some((card) => sameCity(card, frame) && !used.has(card.id))) {
      errors.push(`Day ${frame.day} has no stops although candidates remain.`);
    }
    return { ...frame, stops };
  });

  // A preview day shows one day of the city. Requested spots wait for the locked days.
  if (mode === "full") {
    for (const card of cards) {
      if (card.requested && !used.has(card.id) && frames.some((frame) => sameCity(card, frame))) {
        errors.push(`${card.name} was requested by the user and is not scheduled.`);
      }
    }
  }
  return { days, errors };
}

/** The draft from the last reviewed proposal; whatever still does not fit becomes a conflict. */
export function finishDraft(
  allocation: { readonly mode: PlanMode; readonly totalDays: number | null; readonly frames: readonly DayFrame[]; readonly route: PlanRoute },
  cards: readonly SpotCard[],
  days: readonly PlanDay[],
): PlanDraft {
  const scheduled = new Set(days.flatMap(({ stops }) => stops.map(({ spotId }) => spotId)));
  const conflicts: PlanConflict[] = [];
  if (allocation.mode === "full") {
    for (const card of cards) {
      const inTrip = allocation.frames.some((frame) => sameCity(card, frame));
      if (card.requested && inTrip && !scheduled.has(card.id)) conflicts.push({ kind: "requested_unscheduled", spotId: card.id });
    }
  }
  for (const day of days) {
    if (day.stops.length === 0) conflicts.push({ kind: "not_enough_candidates", day: day.day });
  }

  const unverified = cards
    .filter((card) => scheduled.has(card.id))
    .map((card) => ({ spotId: card.id, fields: spotFacts.filter((fact) => card[fact] === null) }))
    .filter(({ fields }) => fields.length > 0);
  return { mode: allocation.mode, totalDays: allocation.totalDays, route: allocation.route, days, conflicts, unverified };
}
