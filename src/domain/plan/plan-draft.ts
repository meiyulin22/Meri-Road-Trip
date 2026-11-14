import type { TripState } from "@/domain/trip-state/trip-state";
import { formatExactDate, parseExactDate, parseExactDays } from "@/domain/trip-state/trip-dates";

import type { SpotCard, SpotEvidence } from "./spot-card";

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
};

export type PlanDay = DayFrame & { readonly stops: readonly PlanStop[] };

export type PlanConflict =
  | { readonly kind: "requested_unscheduled"; readonly spotId: string }
  | { readonly kind: "not_enough_candidates"; readonly day: number };

export type PlanMode = "preview" | "full";

export type PlanDraft = {
  readonly mode: PlanMode;
  readonly totalDays: number | null;
  readonly days: readonly PlanDay[];
  readonly conflicts: readonly PlanConflict[];
  /** Scheduled spots whose facts no source supports yet, shown as 待核实. */
  readonly unverified: readonly { readonly spotId: string; readonly fields: readonly SpotFact[] }[];
};

export type DayAllocation =
  | { readonly status: "ready"; readonly mode: PlanMode; readonly totalDays: number | null; readonly frames: readonly DayFrame[] }
  | { readonly status: "unsupported"; readonly reason: "no_city" | "multiple_cities" };

const dayMs = 24 * 60 * 60 * 1000;

/**
 * Which city each day is in. Without a confirmed duration, the first selected city gets
 * one preview day and the rest stay locked. A single city takes every confirmed day.
 * Several cities need the Plan Agent's allocation, which is not built yet.
 */
export function allocateDays(tripState: TripState): DayAllocation {
  const destination = tripState.destination;
  const cities = destination.state === "known"
    ? destination.areas.flatMap(({ province, places }) => places.map(({ name }) => ({ province, city: name })))
    : [];
  if (cities.length === 0) return { status: "unsupported", reason: "no_city" };

  const totalDays = parseExactDays(tripState.duration);
  if (totalDays !== null && cities.length > 1) return { status: "unsupported", reason: "multiple_cities" };

  const start = parseExactDate(tripState.startDate);
  const frames = Array.from({ length: totalDays ?? 1 }, (_, index) => ({
    day: index + 1,
    date: start === null ? null : formatExactDate(start + index * dayMs),
    ...cities[0],
  }));
  return { status: "ready", mode: totalDays === null ? "preview" : "full", totalDays, frames };
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
      if (stops.length >= maxStops) {
        errors.push(`Day ${frame.day} has more than ${maxStops} stops.`);
        break;
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
  allocation: Extract<DayAllocation, { status: "ready" }>,
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
  return { mode: allocation.mode, totalDays: allocation.totalDays, days, conflicts, unverified };
}
