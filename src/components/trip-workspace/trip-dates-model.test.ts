import assert from "node:assert/strict";
import test from "node:test";

import type { TripStateField } from "@/domain/trip-state/trip-state";

import { createTripDatesPatch, toCalendarDate, toStoredDate, tripDatesSummary } from "./trip-dates-model";

const missing: TripStateField = { state: "missing" };
const known = (value: string): TripStateField => ({ state: "known", value, source: "user" });
const rough = (value: string): TripStateField => ({ state: "approximate", value, source: "user" });
const today = new Date(2026, 9, 1);

test("a known span reads as one line with its length", () => {
  assert.deepEqual(
    tripDatesSummary({ startDate: known("2026-10-01"), endDate: known("2026-10-07"), duration: known("7天") }, today),
    { text: "10月1日 → 10月7日 · 7天", certainty: "known" },
  );
  assert.equal(
    tripDatesSummary({ startDate: known("2027-01-02"), endDate: missing, duration: missing }, today).text,
    "2027年1月2日 出发",
  );
  assert.equal(tripDatesSummary({ startDate: missing, endDate: missing, duration: known("7天") }, today).text, "7天");
});

test("rough words stay as Meri heard them and mark the whole row rough", () => {
  assert.deepEqual(
    tripDatesSummary({ startDate: rough("十月底"), endDate: missing, duration: rough("大概一周") }, today),
    { text: "十月底 出发 · 大概一周", certainty: "approximate" },
  );
  assert.deepEqual(tripDatesSummary({ startDate: missing, endDate: missing, duration: missing }, today),
    { text: "—", certainty: "missing" });
});

test("calendar days round-trip to stored days without a timezone shift", () => {
  const day = new Date(2026, 9, 1);
  assert.equal(toStoredDate(day), "2026-10-01");
  assert.equal(toCalendarDate(known("2026-10-01"))?.getTime(), day.getTime());
  assert.equal(toCalendarDate(rough("十月")), undefined);
});

test("the picker saves only what the user chose and leaves the third to the server", () => {
  assert.deepEqual(createTripDatesPatch({ startDate: new Date(2026, 9, 1), endDate: new Date(2026, 9, 7) }), {
    startDate: known("2026-10-01"),
    endDate: known("2026-10-07"),
  });
  assert.deepEqual(createTripDatesPatch({ days: 5 }), { duration: known("5天") });
});
