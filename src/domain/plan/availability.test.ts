import assert from "node:assert/strict";
import test from "node:test";

import {
  inMonthDayRange,
  monthDayInQuote,
  numberInQuote,
  staleNotice,
  stopVerdict,
  timeInQuote,
  weekdayInQuote,
  weekdayOf,
} from "./availability";
import type { SpotAvailability, SpotEvidence } from "./spot-card";

const evidence = (quote: string, publishedAt: string | null = null): SpotEvidence => ({
  url: "https://example.com", title: "来源", publishedAt, checkedAt: "2026-11-15T08:00:00.000Z", quote,
});

test("values must appear in their quote, in the ways sources write them", () => {
  assert.equal(weekdayInQuote(1, "每周一闭馆（节假日除外）"), true);
  assert.equal(weekdayInQuote(1, "星期一休馆"), true);
  assert.equal(weekdayInQuote(7, "周日不开放"), true);
  assert.equal(weekdayInQuote(2, "每周一闭馆"), false);
  assert.equal(timeInQuote("07:00", "开放时间 7:00–18:00"), true);
  assert.equal(timeInQuote("18:00", "开放时间 7：00-18：00"), true);
  assert.equal(timeInQuote("17:00", "开放时间 7:00–18:00"), false);
  assert.equal(monthDayInQuote("12-01", "12月1日至次年3月31日封闭"), true);
  assert.equal(monthDayInQuote("03-31", "12月1日至次年3月31日封闭"), true);
  assert.equal(monthDayInQuote("11-01", "12月1日至次年3月31日封闭"), false);
  assert.equal(numberInQuote(3, "需提前3天实名预约"), true);
  assert.equal(numberInQuote(1, "需提前一天预约"), true);
  assert.equal(numberInQuote(2, "需提前3天预约"), false);
});

test("dates: weekdays, ranges across the new year, and stale notices", () => {
  assert.equal(weekdayOf("2026-12-21"), 1);
  assert.equal(weekdayOf("2026-12-20"), 7);
  assert.equal(inMonthDayRange("2026-12-21", "12-01", "03-31"), true);
  assert.equal(inMonthDayRange("2027-02-10", "12-01", "03-31"), true);
  assert.equal(inMonthDayRange("2027-05-10", "12-01", "03-31"), false);
  assert.equal(inMonthDayRange("2027-07-15", "07-01", "08-31"), true);
  assert.equal(staleNotice(evidence("…", "2025-06-01"), "2026-11-15"), true);
  assert.equal(staleNotice(evidence("…", "2026-08-01"), "2026-11-15"), false);
  assert.equal(staleNotice(evidence("…", null), "2026-11-15"), false);
});

const yulong: SpotAvailability = {
  checkedAt: "2026-11-15T08:00:00.000Z",
  hours: { open: "07:00", close: "18:00", evidence: evidence("开放时间 7:00–18:00") },
  closedWeekdays: [{ weekday: 1, scope: "冰川公园大索道", evidence: evidence("大索道每周一检修停运") }],
  closedRanges: [{ from: "12-01", to: "03-31", scope: "蓝月谷部分区域", evidence: evidence("12月1日至次年3月31日蓝月谷部分区域封闭") }],
  reservation: { required: true, daysAhead: 1, evidence: evidence("需提前1天实名预约") },
  uncertain: [],
};

test("a stop's verdict on its day comes from the rules, decided in code", () => {
  // Monday in December: only parts close, so the spot is partly open.
  const monday = stopVerdict(yulong, "2026-12-21", "morning", "2026-11-15");
  assert.equal(monday.status, "partial");
  assert.deepEqual(monday.reasons.map(({ kind }) => kind), ["weekday", "range"]);
  // A whole-spot weekly closing closes it.
  const museum: SpotAvailability = { ...yulong, closedRanges: [], closedWeekdays: [{ weekday: 1, scope: null, evidence: evidence("每周一闭馆") }] };
  assert.equal(stopVerdict(museum, "2026-12-21", "morning", "2026-11-15").status, "closed");
  assert.equal(stopVerdict(museum, "2026-12-22", "morning", "2026-11-15").status, "open");
  // An evening stop at a place that closes at five is not possible.
  const early: SpotAvailability = { ...museum, closedWeekdays: [], hours: { open: "09:00", close: "17:00", evidence: evidence("9:00-17:00") } };
  assert.deepEqual(stopVerdict(early, "2026-12-22", "evening", "2026-11-15").reasons, [{ kind: "closes_early", close: "17:00" }]);
  assert.equal(stopVerdict(early, "2026-12-22", "afternoon", "2026-11-15").status, "open");
  // Without dates nothing can be decided; a stale closing notice is not used.
  assert.deepEqual(stopVerdict(museum, null, "morning", "2026-11-15"), { status: "uncertain", reasons: [{ kind: "no_date" }] });
  const stale: SpotAvailability = { ...museum, closedWeekdays: [],
    closedRanges: [{ from: "12-01", to: "12-31", scope: null, evidence: evidence("12月1日至12月31日闭园维修", "2024-10-01") }] };
  assert.equal(stopVerdict(stale, "2026-12-21", "morning", "2026-11-15").status, "open");
  assert.equal(stopVerdict(undefined, "2026-12-21", "morning", "2026-11-15").status, "unchecked");
  // Searched, but nothing found: still unknown, never "open".
  const empty: SpotAvailability = { ...yulong, hours: null, closedWeekdays: [], closedRanges: [], reservation: null };
  assert.equal(stopVerdict(empty, "2026-12-21", "morning", "2026-11-15").status, "unchecked");
  const vague: SpotAvailability = { ...early, uncertain: [{ note: "冬季视天气关闭部分线路", evidence: evidence("冬季部分线路视天气关闭") }] };
  assert.equal(stopVerdict(vague, "2026-12-22", "morning", "2026-11-15").status, "uncertain");
});
