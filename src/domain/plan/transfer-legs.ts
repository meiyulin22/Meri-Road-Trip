import type { TransportPreference } from "@/domain/trip-draft/trip-draft";
import type { LocationField, TripStateField } from "@/domain/trip-state/trip-state";

import type { DayFrame, PlanMode } from "./plan-draft";

/**
 * Getting to the trip, between its cities and home again (1.2106): the setting-off leg before
 * day 1, a leg into every day that starts in a new city, and the way back after the last day.
 * Which legs exist is decided here, by code, from the route and the origin; how each leg is
 * travelled is the transport step's question.
 */
export type TransferKind = "outbound" | "between" | "return";

/**
 * What is known about one leg's time. Only `estimated` carries numbers: a rough drive from city
 * centre to city centre. Every other status says plainly why there is no time.
 */
export type TransferEstimate =
  | {
      readonly status: "estimated";
      readonly distanceKm: number;
      readonly durationMinutes: number;
      /** Longitude, latitude pairs along the road, at most 200. */
      readonly path: readonly (readonly [number, number])[];
    }
  /** No origin in the trip: the setting-off and return legs have nothing to start from. */
  | { readonly status: "origin_missing" }
  /** An origin only roughly known, such as 江浙一带: not a place to drive from. */
  | { readonly status: "origin_uncertain" }
  /** The traveller starts in the trip's first city, or ends where they started. */
  | { readonly status: "same_city" }
  /** The map has no such place, as for a city abroad. */
  | { readonly status: "not_found"; readonly place: string }
  /** The map found both places but no road between them. */
  | { readonly status: "no_route" }
  /** Not looked up: the lookups stopped at a failure or ran out. */
  | { readonly status: "not_looked_up" };

/** One seat class on a train as 12306 listed it: its price and how many are left, as information only. */
export type TrainSeat = {
  readonly name: string;
  readonly price: number | null;
  /** 12306's own word: 有 (plenty), 无 (none), or a number left. */
  readonly left: string;
};

/** One train between two cities, as 12306 answered and code checked (1.2108). */
export type TrainOption = {
  readonly code: string;
  readonly from: string;
  readonly to: string;
  /** Clock times, HH:MM. */
  readonly departs: string;
  readonly arrives: string;
  /** Days after the departure day the train arrives: 0 the same day. Code computes it. */
  readonly arriveDayOffset: number;
  readonly durationMinutes: number;
  /** For a journey with a change, empty: each train in `change` has its own seats. */
  readonly seats: readonly TrainSeat[];
  /**
   * A journey with one change (1.2110): the two direct trains and the change between them. The
   * journey's own fields cover it whole: first departure, last arrival, total time with the wait.
   */
  readonly change?: TrainChange;
};

export type TrainChange = {
  /** The city changed in, as 12306 names it: 昆明. */
  readonly city: string;
  readonly waitMinutes: number;
  /** False when the second train leaves from another station of the city: 昆明 to 昆明南. */
  readonly sameStation: boolean;
  readonly first: TrainOption;
  readonly second: TrainOption;
};

/**
 * The trains found for a leg. Beyond 12306's presale window the leg's own day cannot be asked,
 * so the same weekday inside the window is, and the trains are only a reference for the timetable.
 */
export type LegTrains = {
  readonly queriedDate: string;
  readonly reference: boolean;
  readonly checkedAt: string;
  readonly options: readonly TrainOption[];
};

/** How a leg is best travelled: the transport agent's pick, checked by code, or code's own fallback. */
export type LegRecommendation = {
  readonly mode: "train" | "drive";
  /** The train picked, one of the leg's options; null for a drive. */
  readonly trainCode: string | null;
  readonly reason: string;
  readonly by: "agent" | "code";
};

export type TransferLeg = {
  readonly kind: TransferKind;
  /** The day the leg belongs to: 1 for setting off, the arrival day between cities, the last day for the way back. */
  readonly day: number;
  /** The place left; null for setting off when there is no origin. Uncertain origins keep their words. */
  readonly from: string | null;
  /** The place reached; null for the way back when there is no origin. */
  readonly to: string | null;
  readonly estimate: TransferEstimate;
  /** Trains looked up for this leg (1.2108); absent when none were. */
  readonly trains?: LegTrains;
  readonly recommendation?: LegRecommendation;
  /**
   * Searched for trains but none to show: no direct train, a city without a station, or 12306 not
   * reachable or out of requests. Absent when no search was made.
   */
  readonly trainsMissing?: "none" | "no_station" | "unavailable";
};

/** How many days ahead 12306 sells, counting today as day 0 (probe 2026-11-17: +3 answered, +34 did not). */
export const railPresaleDays = 14;

const dayMs = 24 * 60 * 60 * 1_000;
const toDay = (date: string) => Date.parse(`${date}T00:00:00Z`);
const fromDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * The date to ask 12306 for a leg on `date`, seen from `today` (both YYYY-MM-DD, Beijing time):
 * the date itself inside the presale window; beyond it, the latest same weekday inside the
 * window, as a reference for the timetable. A date already past has none.
 */
export function railQueryDate(date: string, today: string): { readonly date: string; readonly reference: boolean } | null {
  const target = toDay(date);
  const start = toDay(today);
  if (!Number.isFinite(target) || !Number.isFinite(start) || target < start) return null;
  const last = start + railPresaleDays * dayMs;
  if (target <= last) return { date, reference: false };
  const weeksBack = Math.ceil((target - last) / (7 * dayMs));
  return { date: fromDay(target - weeksBack * 7 * dayMs), reference: true };
}

/** A drive this long is still shown, with a word that a train or flight may suit better. */
export const longDriveMinutes = 6 * 60;

function originOf(origin: LocationField): { readonly name: string | null; readonly status: TransferEstimate | null } {
  if (origin.state === "missing") return { name: null, status: { status: "origin_missing" } };
  const name = origin.value.trim();
  if (origin.state !== "known" || name === "") return { name: name || null, status: { status: "origin_uncertain" } };
  return { name, status: null };
}

/**
 * The legs a plan needs, in the order the page shows them, each still to be looked up unless
 * the origin already says why it cannot be. A day whose city differs from the day before is a
 * leg between cities, exactly the days the route marks `arrivingFrom`. A preview plan shows only
 * its first day, so it has no way back yet.
 */
export function transferLegs(frames: readonly DayFrame[], origin: LocationField, mode: PlanMode): TransferLeg[] {
  const ordered = [...frames].sort((left, right) => left.day - right.day);
  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  if (!first || !last) return [];
  const start = originOf(origin);
  const pending: TransferEstimate = { status: "not_looked_up" };
  const legs: TransferLeg[] = [
    { kind: "outbound", day: first.day, from: start.name, to: first.city, estimate: start.status ?? pending },
    ...ordered.filter((frame) => frame.arrivingFrom !== null).map((frame): TransferLeg => ({
      kind: "between", day: frame.day, from: frame.arrivingFrom, to: frame.city, estimate: pending,
    })),
  ];
  if (mode === "full") {
    legs.push({ kind: "return", day: last.day, from: last.city, to: start.name, estimate: start.status ?? pending });
  }
  return legs;
}

/**
 * How the traveller wants to get to and between the cities, chosen once on the plan page (1.2107):
 * drive themselves, train, flight, or let Meri compare. Train and flight are only recorded until
 * the transport agent can look them up (1.2108); the leg keeps its rough drive meanwhile.
 */
export const travelChoices = ["drive", "train", "flight", "auto"] as const;
export type TravelChoice = (typeof travelChoices)[number];

/** The trip's transport preference a choice stands for: train and flight are both public transport. */
export function transportPreferenceFor(choice: TravelChoice): TransportPreference {
  return choice === "drive" ? "self_drive" : choice === "auto" ? "flexible" : "public_transport";
}

/**
 * The choice a trip's transport preference stands for when nothing was chosen on the plan page
 * (1.2108): self-drive drives, public transport takes the train (flights are not wired yet), not
 * driving or flexible lets Meri compare. No preference means no choice: only the drive is estimated.
 */
export function travelChoiceOf(preference: TripStateField<TransportPreference>): TravelChoice | null {
  if (preference.state !== "known") return null;
  if (preference.value === "self_drive") return "drive";
  return preference.value === "public_transport" ? "train" : "auto";
}

/**
 * Where the origin is when the traveller picked it from the map's suggestions (1.2107), in
 * Tianditu's own coordinates; null for an origin typed in conversation, which is looked up by name.
 */
export function originPoint(origin: LocationField): { readonly longitude: number; readonly latitude: number } | null {
  if (origin.state !== "known") return null;
  const coordinates = origin.selection?.provider === "tianditu" ? origin.selection.coordinates : null;
  if (!coordinates || coordinates.coordinateSystem !== "CGCS2000") return null;
  return { longitude: coordinates.longitude, latitude: coordinates.latitude };
}
