import { stopVerdict, type StopVerdict } from "./availability";
import type { DaySlot, PlanDay, PlanStop, StopCheck } from "./plan-draft";
import type { SpotCard } from "./spot-card";

export type Verdicts = ReadonlyMap<string, StopVerdict>;
const key = (day: number, spotId: string) => `${day}|${spotId}`;

/** The second round's verdict for every scheduled stop, on its own date and in its slot. */
export function verdictsFor(days: readonly PlanDay[], cards: ReadonlyMap<string, SpotCard>, referenceDate: string): Verdicts {
  const verdicts = new Map<string, StopVerdict>();
  for (const day of days) {
    for (const stop of day.stops) {
      verdicts.set(key(day.day, stop.spotId), stopVerdict(cards.get(stop.spotId)?.availability, day.date, stop.slot, referenceDate));
    }
  }
  return verdicts;
}

export function verdictOf(verdicts: Verdicts, day: number, spotId: string): StopVerdict {
  return verdicts.get(key(day, spotId)) ?? { status: "unchecked", reasons: [] };
}

/** Stops that cannot happen where they are: the issues the repair loop works on. */
export function closedStops(days: readonly PlanDay[], verdicts: Verdicts): { day: number; spotId: string }[] {
  return days.flatMap((day) => day.stops
    .filter((stop) => verdictOf(verdicts, day.day, stop.spotId).status === "closed")
    .map((stop) => ({ day: day.day, spotId: stop.spotId })));
}

export type Moved = { readonly spotId: string; readonly from: number; readonly to: number };

/**
 * Repairs that need no model: an evening stop at a place that closes early moves to the
 * afternoon of the same day; a closed stop moves to another day in the same city where it
 * is open and there is room. A transfer day's morning stays free. What cannot move is left
 * for the Plan Agent, by day.
 */
export function moveClosedStops(
  days: readonly PlanDay[],
  cards: ReadonlyMap<string, SpotCard>,
  referenceDate: string,
  maxStops: number,
): { days: PlanDay[]; moved: Moved[]; stuck: { day: number; spotId: string }[] } {
  const result = days.map((day) => ({ ...day, stops: [...day.stops] }));
  const moved: Moved[] = [];
  const stuck: { day: number; spotId: string }[] = [];
  const verdict = (day: PlanDay, stop: PlanStop, slot: DaySlot = stop.slot) =>
    stopVerdict(cards.get(stop.spotId)?.availability, day.date, slot, referenceDate);
  const limit = (day: PlanDay) => day.arrivingFrom === null ? maxStops : Math.max(1, maxStops - 1);

  for (const day of result) {
    for (const stop of [...day.stops]) {
      const current = verdict(day, stop);
      if (current.status !== "closed") continue;
      // Too late in the evening, open in the afternoon: keep the day, change the slot.
      if (stop.slot === "evening" && verdict(day, stop, "afternoon").status !== "closed") {
        day.stops = day.stops.map((item) => item === stop ? { ...stop, slot: "afternoon", anchor: null } : item);
        continue;
      }
      const target = result.find((other) => other.day !== day.day && other.province === day.province && other.city === day.city
        && other.stops.length < limit(other)
        && verdict(other, stop, other.arrivingFrom !== null && stop.slot === "morning" ? "afternoon" : stop.slot).status !== "closed");
      if (!target) {
        stuck.push({ day: day.day, spotId: stop.spotId });
        continue;
      }
      const slot: DaySlot = target.arrivingFrom !== null && stop.slot === "morning" ? "afternoon" : stop.slot;
      day.stops = day.stops.filter((item) => item !== stop);
      // A time anchor belonged to the old day's plan; the new day starts without one.
      target.stops = [...target.stops, { ...stop, slot, anchor: null }];
      moved.push({ spotId: stop.spotId, from: day.day, to: target.day });
    }
  }
  return { days: result, moved, stuck };
}

/** The per-stop record kept with the plan: verdict, booking, and where a stop came from. */
export function stopChecks(
  days: readonly PlanDay[],
  cards: ReadonlyMap<string, SpotCard>,
  verdicts: Verdicts,
  moved: readonly Moved[],
): StopCheck[] {
  return days.flatMap((day) => day.stops.map((stop) => {
    const reservation = cards.get(stop.spotId)?.availability?.reservation;
    return {
      day: day.day,
      spotId: stop.spotId,
      status: verdictOf(verdicts, day.day, stop.spotId).status,
      reservation: reservation?.required ? { daysAhead: reservation.daysAhead } : null,
      movedFrom: moved.findLast(({ spotId, to }) => spotId === stop.spotId && to === day.day)?.from ?? null,
    };
  }));
}
