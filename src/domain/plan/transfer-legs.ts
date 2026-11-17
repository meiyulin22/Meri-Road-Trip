import type { TransportPreference } from "@/domain/trip-draft/trip-draft";
import type { LocationField } from "@/domain/trip-state/trip-state";

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

export type TransferLeg = {
  readonly kind: TransferKind;
  /** The day the leg belongs to: 1 for setting off, the arrival day between cities, the last day for the way back. */
  readonly day: number;
  /** The place left; null for setting off when there is no origin. Uncertain origins keep their words. */
  readonly from: string | null;
  /** The place reached; null for the way back when there is no origin. */
  readonly to: string | null;
  readonly estimate: TransferEstimate;
};

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
 * Where the origin is when the traveller picked it from the map's suggestions (1.2107), in
 * Tianditu's own coordinates; null for an origin typed in conversation, which is looked up by name.
 */
export function originPoint(origin: LocationField): { readonly longitude: number; readonly latitude: number } | null {
  if (origin.state !== "known") return null;
  const coordinates = origin.selection?.provider === "tianditu" ? origin.selection.coordinates : null;
  if (!coordinates || coordinates.coordinateSystem !== "CGCS2000") return null;
  return { longitude: coordinates.longitude, latitude: coordinates.latitude };
}
