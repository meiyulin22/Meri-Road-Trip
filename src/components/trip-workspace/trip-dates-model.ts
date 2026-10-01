import type { TripState, TripStateField, TripStatePatch } from "@/domain/trip-state/trip-state";
import { formatExactDays, parseExactDate, type TripDateFieldName } from "@/domain/trip-state/trip-dates";

import type { FieldCertainty } from "./field-certainty";

type TripDates = Pick<TripState, TripDateFieldName>;

const certaintyRank: Record<FieldCertainty, number> = { missing: 0, known: 1, approximate: 2, ambiguous: 3 };

/** The calendar's local-midnight Date as the stored YYYY-MM-DD day. */
export function toStoredDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** A stored exact day as a local-midnight Date for the calendar, or undefined. */
export function toCalendarDate(field: TripStateField): Date | undefined {
  const time = parseExactDate(field);
  if (time === null) return undefined;
  const utc = new Date(time);
  return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate());
}

function dayLabel(field: TripStateField, today: Date): string | null {
  if (field.state === "missing") return null;
  const date = toCalendarDate(field);
  if (date === undefined) return field.value;
  const monthDay = `${date.getMonth() + 1}月${date.getDate()}日`;
  return date.getFullYear() === today.getFullYear() ? monthDay : `${date.getFullYear()}年${monthDay}`;
}

/**
 * One line for 何时: the span when it is known, and Meri's rough words when it is not.
 * The row is only as certain as its least certain part, so 「10月1日 → 十月中旬」 is
 * still marked rough even though one end is an exact day.
 */
export function tripDatesSummary(dates: TripDates, today: Date): {
  readonly text: string;
  readonly certainty: FieldCertainty;
} {
  const start = dayLabel(dates.startDate, today);
  const end = dayLabel(dates.endDate, today);
  const length = dates.duration.state === "missing" ? null : dates.duration.value;
  const span = start && end ? `${start} → ${end}` : start ? `${start} 出发` : end ? `${end} 结束` : null;
  const text = [span, length].filter(Boolean).join(" · ") || "—";
  const certainty = [dates.startDate, dates.endDate, dates.duration]
    .map((field) => field.state)
    .reduce<FieldCertainty>((worst, state) => certaintyRank[state] > certaintyRank[worst] ? state : worst, "missing");
  return { text, certainty };
}

/**
 * The edit the date picker saves. Each value it sets is an exact choice the user made;
 * the server fills in the third of start, end and length, so this never computes it.
 */
export function createTripDatesPatch(values: {
  readonly startDate?: Date;
  readonly endDate?: Date;
  readonly days?: number;
}): TripStatePatch {
  const patch: { -readonly [K in TripDateFieldName]?: TripStateField } = {};
  if (values.startDate) patch.startDate = { state: "known", value: toStoredDate(values.startDate), source: "user" };
  if (values.endDate) patch.endDate = { state: "known", value: toStoredDate(values.endDate), source: "user" };
  if (values.days !== undefined) patch.duration = { state: "known", value: formatExactDays(values.days), source: "user" };
  return patch;
}

export const clearedTripDatesPatch: TripStatePatch = {
  startDate: { state: "missing" },
  endDate: { state: "missing" },
  duration: { state: "missing" },
};
