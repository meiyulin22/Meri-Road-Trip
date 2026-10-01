import type { TripState, TripStateField } from "./trip-state";

export type TripDateFieldName = "startDate" | "endDate" | "duration";

export const tripDateFieldNames: readonly TripDateFieldName[] = ["startDate", "endDate", "duration"];

const maxTripDays = 366;
const dayMs = 24 * 60 * 60 * 1000;

/**
 * An exact calendar day written as YYYY-MM-DD, or null. 「下周末」 or 「10月初」 are useful
 * to keep but are not days, so nothing is ever calculated from them.
 */
export function parseExactDate(field: TripStateField): number | null {
  if (field.state !== "known") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(field.value.trim());
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const time = Date.UTC(year, month - 1, day);
  const date = new Date(time);
  // Date.UTC rolls 2026-02-30 over into March; a value that does not survive the round
  // trip was never a real day.
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return time;
}

/** A whole number of days written as 「7天」 or 「7天6晚」, or null for 「一周左右」. */
export function parseExactDays(field: TripStateField): number | null {
  if (field.state !== "known") return null;
  const match = /^(\d{1,3})\s*天(?:\s*\d{1,3}\s*晚)?$/.exec(field.value.trim());
  if (!match) return null;
  const days = Number(match[1]);
  return days >= 1 && days <= maxTripDays ? days : null;
}

export function formatExactDate(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

export function formatExactDays(days: number): string {
  return `${days}天`;
}

/**
 * Start, end and length describe one span, so any two decide the third. Days count
 * inclusively, the way travellers say it: the 1st to the 7th is 7天 (7天6晚).
 *
 * Which value gets recalculated depends on what the user just changed: the fields in
 * `changed` are what they meant, and the one they did not touch moves to fit. When a
 * start moves and the length is known, the length is kept and the end follows, since
 * 「晚两天出发，还是玩七天」 is the usual intent. Nothing is derived from inexact values,
 * and an end before its start is left alone rather than guessed at.
 */
export function deriveTripDates(
  state: Pick<TripState, TripDateFieldName>,
  changed: ReadonlySet<TripDateFieldName>,
): Partial<Pick<TripState, TripDateFieldName>> {
  const start = parseExactDate(state.startDate);
  const end = parseExactDate(state.endDate);
  const days = parseExactDays(state.duration);
  const startChanged = changed.has("startDate") && start !== null;
  const endChanged = changed.has("endDate") && end !== null;
  const daysChanged = changed.has("duration") && days !== null;

  if (startChanged && endChanged) return durationFrom(start, end);
  if (startChanged && daysChanged) return { endDate: derivedDate(start + (days - 1) * dayMs) };
  if (endChanged && daysChanged) return { startDate: derivedDate(end - (days - 1) * dayMs) };
  if (startChanged) {
    if (days !== null) return { endDate: derivedDate(start + (days - 1) * dayMs) };
    if (end !== null) return durationFrom(start, end);
  }
  if (endChanged) {
    if (start !== null) return durationFrom(start, end);
    if (days !== null) return { startDate: derivedDate(end - (days - 1) * dayMs) };
  }
  if (daysChanged) {
    if (start !== null) return { endDate: derivedDate(start + (days - 1) * dayMs) };
    if (end !== null) return { startDate: derivedDate(end - (days - 1) * dayMs) };
  }
  return {};
}

function durationFrom(start: number, end: number): Partial<Pick<TripState, "duration">> {
  const days = Math.round((end - start) / dayMs) + 1;
  if (days < 1 || days > maxTripDays) return {};
  return { duration: { state: "known", value: formatExactDays(days), source: "system" } };
}

function derivedDate(time: number): TripStateField {
  return { state: "known", value: formatExactDate(time), source: "system" };
}
