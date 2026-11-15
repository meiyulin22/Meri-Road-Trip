import type { DaySlot } from "./plan-draft";
import type { SpotAvailability, SpotEvidence } from "./spot-card";

const chineseDays = ["一", "二", "三", "四", "五", "六", "日"] as const;
const englishDays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
const chineseNumbers = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"] as const;

/** A notice older than this, by its source's publish date, may no longer hold. */
const noticeMaxAgeDays = 365;
/** An evening visit needs the spot open until at least this time. */
const eveningNeedsUntil = "18:00";

function normalized(quote: string): string {
  return quote.replaceAll("：", ":").replaceAll("－", "-").replaceAll("～", "~").toLowerCase();
}

/** A quote that names this weekday: 周一, 星期一, 礼拜一, Monday; Sunday also as 周日 or 周天. */
export function weekdayInQuote(weekday: number, quote: string): boolean {
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) return false;
  const text = normalized(quote);
  const names = weekday === 7 ? ["日", "天"] : [chineseDays[weekday - 1]];
  return names.some((name) => ["周", "星期", "礼拜"].some((prefix) => text.includes(prefix + name)))
    || text.includes(englishDays[weekday - 1]);
}

/** A quote that states this time, as 07:00 or 7:00. */
export function timeInQuote(time: string, quote: string): boolean {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/u.exec(time);
  if (!match) return false;
  const text = normalized(quote);
  const hour = Number(match[1]);
  return [`${hour}:${match[2]}`, `${String(hour).padStart(2, "0")}:${match[2]}`].some((form) => text.includes(form));
}

/** A quote that states this month and day, as 12月1日, 12-01, 12/1 or 12.1. */
export function monthDayInQuote(monthDay: string, quote: string): boolean {
  const match = /^(\d{2})-(\d{2})$/u.exec(monthDay);
  if (!match) return false;
  const month = Number(match[1]);
  const day = Number(match[2]);
  const text = normalized(quote);
  return new RegExp(`(^|\\D)0?${month}(月|[-/.])0?${day}(日|号|\\D|$)`, "u").test(text);
}

/** A quote that states this small number, in digits or Chinese numerals up to ten. */
export function numberInQuote(value: number, quote: string): boolean {
  const text = normalized(quote);
  if (new RegExp(`(^|\\D)${value}(\\D|$)`, "u").test(text)) return true;
  return value >= 0 && value <= 10 && text.includes(chineseNumbers[value]);
}

/** Monday is 1, Sunday 7, for an ISO date. */
export function weekdayOf(date: string): number {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

/** Whether "MM-DD" of the date falls in a month-day range, which may cross the new year. */
export function inMonthDayRange(date: string, from: string, to: string): boolean {
  const monthDay = date.slice(5);
  return from <= to ? monthDay >= from && monthDay <= to : monthDay >= from || monthDay <= to;
}

/** A dated notice whose source is older than a year may be out of date; an undated one is kept. */
export function staleNotice(evidence: SpotEvidence, referenceDate: string): boolean {
  if (!evidence.publishedAt) return false;
  const published = Date.parse(evidence.publishedAt);
  if (Number.isNaN(published)) return false;
  return Date.parse(`${referenceDate}T00:00:00Z`) - published > noticeMaxAgeDays * 24 * 60 * 60 * 1000;
}

export type VerdictReason =
  | { readonly kind: "weekday"; readonly weekday: number; readonly scope: string | null }
  | { readonly kind: "range"; readonly from: string; readonly to: string; readonly scope: string | null }
  | { readonly kind: "closes_early"; readonly close: string }
  | { readonly kind: "notice"; readonly note: string }
  | { readonly kind: "no_date" };

/**
 * Whether a stop can happen on its day. Code decides from the rules the second round
 * extracted: closed when a whole-spot rule hits the date, partial when only a part closes,
 * uncertain for a vague notice or when the trip has no dates yet, unchecked without facts.
 */
export type StopVerdict = {
  readonly status: "open" | "partial" | "closed" | "uncertain" | "unchecked";
  readonly reasons: readonly VerdictReason[];
};

export function stopVerdict(
  availability: SpotAvailability | undefined,
  date: string | null,
  slot: DaySlot,
  referenceDate: string,
): StopVerdict {
  if (!availability) return { status: "unchecked", reasons: [] };
  // Searched but nothing usable found is not "open": it is still unknown.
  const nothingKnown = !availability.hours && availability.closedWeekdays.length === 0 && availability.closedRanges.length === 0
    && !availability.reservation && availability.uncertain.length === 0;
  if (nothingKnown) return { status: "unchecked", reasons: [] };
  const ranges = availability.closedRanges.filter(({ evidence }) => !staleNotice(evidence, referenceDate));
  const notices = availability.uncertain.filter(({ evidence }) => !staleNotice(evidence, referenceDate));
  if (date === null) {
    const hasRules = availability.closedWeekdays.length > 0 || ranges.length > 0 || notices.length > 0;
    return hasRules ? { status: "uncertain", reasons: [{ kind: "no_date" }] } : { status: "open", reasons: [] };
  }

  const reasons: VerdictReason[] = [];
  let closed = false;
  let partial = false;
  const weekday = weekdayOf(date);
  for (const rule of availability.closedWeekdays) {
    if (rule.weekday !== weekday) continue;
    reasons.push({ kind: "weekday", weekday, scope: rule.scope });
    if (rule.scope === null) closed = true;
    else partial = true;
  }
  for (const rule of ranges) {
    if (!inMonthDayRange(date, rule.from, rule.to)) continue;
    reasons.push({ kind: "range", from: rule.from, to: rule.to, scope: rule.scope });
    if (rule.scope === null) closed = true;
    else partial = true;
  }
  if (slot === "evening" && availability.hours && availability.hours.close < eveningNeedsUntil) {
    reasons.push({ kind: "closes_early", close: availability.hours.close });
    closed = true;
  }
  for (const notice of notices) reasons.push({ kind: "notice", note: notice.note });
  const status = closed ? "closed" : partial ? "partial" : notices.length > 0 ? "uncertain" : "open";
  return { status, reasons };
}
