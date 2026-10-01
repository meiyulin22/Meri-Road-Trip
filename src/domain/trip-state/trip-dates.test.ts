import assert from "node:assert/strict";
import test from "node:test";

import type { TripStateField } from "./trip-state";
import { deriveTripDates, parseExactDate, parseExactDays, type TripDateFieldName } from "./trip-dates";

const missing: TripStateField = { state: "missing" };
const known = (value: string): TripStateField => ({ state: "known", value, source: "user" });
const system = (value: string): TripStateField => ({ state: "known", value, source: "system" });

function derive(
  fields: { startDate?: TripStateField; endDate?: TripStateField; duration?: TripStateField },
  changed: TripDateFieldName[],
) {
  return deriveTripDates({
    startDate: fields.startDate ?? missing,
    endDate: fields.endDate ?? missing,
    duration: fields.duration ?? missing,
  }, new Set(changed));
}

test("the 1st to the 7th counts as 7天, inclusive", () => {
  assert.deepEqual(derive({ startDate: known("2026-10-01"), endDate: known("2026-10-07") }, ["endDate"]),
    { duration: system("7天") });
  assert.deepEqual(derive({ startDate: known("2026-10-01"), endDate: known("2026-10-01") }, ["startDate", "endDate"]),
    { duration: system("1天") });
});

test("a start and a length give the end, and an end and a length give the start", () => {
  assert.deepEqual(derive({ startDate: known("2026-10-01"), duration: known("7天") }, ["duration"]),
    { endDate: system("2026-10-07") });
  assert.deepEqual(derive({ endDate: known("2026-10-07"), duration: known("7天") }, ["duration"]),
    { startDate: system("2026-10-01") });
  assert.deepEqual(derive({ endDate: known("2026-10-07"), duration: known("7天") }, ["endDate"]),
    { startDate: system("2026-10-01") });
});

test("moving the start keeps the length and moves the end", () => {
  const all = { startDate: known("2026-10-03"), endDate: known("2026-10-07"), duration: known("7天") };
  assert.deepEqual(derive(all, ["startDate"]), { endDate: system("2026-10-09") });
});

test("moving the end recalculates the length, and changing the length moves the end", () => {
  const all = { startDate: known("2026-10-01"), endDate: known("2026-10-04"), duration: known("7天") };
  assert.deepEqual(derive(all, ["endDate"]), { duration: system("4天") });
  assert.deepEqual(derive(all, ["duration"]), { endDate: system("2026-10-07") });
});

test("a range picked in one go sets the length even when a different one was saved", () => {
  const all = { startDate: known("2026-10-01"), endDate: known("2026-10-03"), duration: known("7天") };
  assert.deepEqual(derive(all, ["startDate", "endDate"]), { duration: system("3天") });
});

test("dates cross month and year ends", () => {
  assert.deepEqual(derive({ startDate: known("2026-12-30"), duration: known("4天") }, ["startDate"]),
    { endDate: system("2027-01-02") });
  assert.deepEqual(derive({ startDate: known("2028-02-28"), duration: known("2天") }, ["duration"]),
    { endDate: system("2028-02-29") });
});

test("fuzzy, missing or impossible values derive nothing", () => {
  assert.deepEqual(derive({ startDate: { state: "approximate", value: "十月初", source: "user" }, duration: known("7天") }, ["startDate"]), {});
  assert.deepEqual(derive({ startDate: known("2026-10-01"), duration: known("一周") }, ["duration"]), {});
  assert.deepEqual(derive({ startDate: known("2026-10-01") }, ["startDate"]), {});
  assert.deepEqual(derive({ startDate: known("2026-10-07"), endDate: known("2026-10-01") }, ["endDate"]), {});
  assert.deepEqual(derive({ startDate: known("2026-10-01"), endDate: known("2026-10-07") }, []), {});
  assert.deepEqual(derive({ startDate: missing, endDate: known("2026-10-07"), duration: known("7天") }, ["startDate"]), {});
});

test("only real calendar days and whole day counts are exact", () => {
  assert.equal(parseExactDate(known("2026-02-30")), null);
  assert.equal(parseExactDate(known("11")), null);
  assert.equal(parseExactDate({ state: "approximate", value: "2026-10-01", source: "user" }), null);
  assert.notEqual(parseExactDate(known("2028-02-29")), null);
  assert.equal(parseExactDays(known("7天6晚")), 7);
  assert.equal(parseExactDays(known("0天")), null);
  assert.equal(parseExactDays(known("7")), null);
});
