import type { Messages } from "@/components/i18n/messages";
import type { TripState, TripStateField, TripStatePatch } from "@/domain/trip-state/trip-state";
import { formatExactDays, parseExactDate, parseExactDays, type TripDateFieldName } from "@/domain/trip-state/trip-dates";

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

function dayLabel(field: TripStateField, today: Date, text: Messages["dates"]): string | null {
  if (field.state === "missing") return null;
  const date = toCalendarDate(field);
  if (date === undefined) return field.value;
  return text.monthDay(date, date.getFullYear() !== today.getFullYear());
}

/**
 * An exact length is stored as 「7天」 and said in the interface's language; anything
 * else — 「7天6晚」, 「大概一周」 — is Meri's or the user's own words, shown as they are.
 */
function lengthLabel(field: TripStateField, text: Messages["dates"]): string | null {
  if (field.state === "missing") return null;
  const days = parseExactDays(field);
  return days !== null && field.value.trim() === formatExactDays(days) ? text.days(days) : field.value;
}

/**
 * One line for 何时: the span when it is known, and Meri's rough words when it is not.
 * The row is only as certain as its least certain part, so 「10月1日 → 十月中旬」 is
 * still marked rough even though one end is an exact day.
 */
export function tripDatesSummary(dates: TripDates, today: Date, words: Messages["dates"]): {
  readonly text: string;
  readonly certainty: FieldCertainty;
} {
  const start = dayLabel(dates.startDate, today, words);
  const end = dayLabel(dates.endDate, today, words);
  const length = lengthLabel(dates.duration, words);
  const span = start && end ? `${start} → ${end}` : start ? words.from(start) : end ? words.until(end) : null;
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
