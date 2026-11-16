import assert from "node:assert/strict";
import test from "node:test";

import type { ReadyPlan } from "@/domain/plan/plan-draft-response";
import type { SpotAvailability, SpotCard } from "@/domain/plan/spot-card";

import { buildHandoff, checkExpectations, evalCaseSchema, measureRun, type RunCapture } from "./eval-plan-score";

const evidence = { url: "https://example.com", title: "来源", publishedAt: null, checkedAt: "2026-11-16T08:00:00.000Z", quote: "需提前预约" };
const booked: SpotAvailability = { checkedAt: "2026-11-16", hours: null, closedWeekdays: [], closedRanges: [],
  reservation: { required: true, daysAhead: 7, evidence }, uncertain: [] };

function spot(name: string, requested = false, availability?: SpotAvailability): SpotCard {
  return { id: name, province: "北京市", city: "北京市", name, requested, location: evidence, opening: null, reservation: null,
    setting: null, walking: null, suggestedDuration: null, mapCheck: { status: "located", district: "东城区" },
    ...(availability ? { availability } : {}) };
}

const beijing = evalCaseSchema.parse({
  id: "beijing-monday", title: "北京 3 天", covers: "Monday closure",
  areas: [{ province: "北京市", cities: [{ city: "北京市", spots: ["故宫"] }] }],
  days: 3, startDate: "2026-12-07",
  expect: {
    mode: "full", keepsAllCities: true, asks: false, scheduled: ["故宫"], reservationFound: ["故宫"],
    notOnWeekdays: [{ spot: "故宫", weekdays: [1] }], maxStopsPerDay: 3, noEmptyDays: true,
  },
});

const day = (number: number, date: string, stops: string[]) => ({
  day: number, date, province: "北京市", city: "北京市", arrivingFrom: null, focus: null, theme: null,
  stops: stops.map((spotId) => ({ spotId, slot: "morning" as const, anchor: null })),
});

function plan(days: ReturnType<typeof day>[], spots: SpotCard[]): ReadyPlan {
  return {
    status: "ready",
    draft: {
      mode: "full", totalDays: days.length,
      route: { source: "agent", cities: [{ province: "北京市", city: "北京市", days: days.length, reason: "首都" }], omitted: [] },
      days, conflicts: [], unverified: [{ spotId: "天坛", fields: ["opening", "walking"] }],
      checks: [{ day: 2, spotId: "故宫", status: "open", reservation: { daysAhead: 7 }, movedFrom: 1 }],
    },
    spots, cities: [{ province: "北京市", city: "北京市", status: "ready" }], pendingProvinces: [], dayPhotos: [], mapCheck: "complete",
  };
}

const capture = (saved: ReadyPlan | null): RunCapture => ({
  events: [
    { type: "city.researched", province: "北京市", city: "北京市", status: "ready", cards: 8, sourced: 7, searches: 4, ms: 20_000 },
    { type: "stage.activity", stage: "route", activity: { kind: "routing", cities: 1, days: 3, attempt: 1 } },
    { type: "stage.activity", stage: "days", activity: { kind: "drafting", city: "北京市", days: [1, 2, 3], attempt: 2 } },
    { type: "stage.finished", stage: "verify", ms: 21_000, summary: { rounds: 1, moved: 1 } },
  ],
  run: { status: "succeeded", errorCode: null, durationMs: 60_000, usage: { inputTokens: 900, outputTokens: 300, searches: 10, mapLookups: 2 } },
  plan: saved,
});

test("buildHandoff writes the trip as the plan page would, with the end date derived", () => {
  const handoff = buildHandoff(beijing, "2026-11-16");
  assert.deepEqual(handoff.tripState.endDate, { state: "known", value: "2026-12-09", source: "user" });
  assert.deepEqual(handoff.tripState.duration, { state: "known", value: "3天", source: "user" });
  assert.equal(handoff.referenceDate, "2026-11-16");
  assert.equal(handoff.locale, "zh");
});

test("a Monday closure moved to Tuesday passes, and the numbers come from events and plan", () => {
  const saved = plan([day(1, "2026-12-07", ["天坛"]), day(2, "2026-12-08", ["故宫"]), day(3, "2026-12-09", ["颐和园"])],
    [spot("故宫", true, booked), spot("天坛"), spot("颐和园")]);
  const handoff = buildHandoff(beijing, "2026-11-16");
  const results = checkExpectations(beijing, capture(saved), handoff);
  assert.deepEqual(results.filter(({ passed }) => !passed), []);

  const metrics = measureRun(capture(saved), handoff);
  assert.deepEqual(metrics.searches, { research: 4, verify: 6 });
  assert.deepEqual(metrics.requested, { total: 1, scheduled: 1 });
  assert.equal(metrics.dayRetries, 1);
  assert.equal(metrics.unverifiedFields, 2);
  assert.deepEqual(metrics.repair, { rounds: 1, moved: 1 });
  assert.equal(metrics.checks.open, 1);
});

test("a stop left on a Monday, a missing booking rule and an empty day each fail on their own", () => {
  const saved = plan([day(1, "2026-12-07", ["故宫"]), day(2, "2026-12-08", []), day(3, "2026-12-09", ["天坛"])],
    [spot("故宫博物院", true), spot("天坛")].map((card) => card.name === "故宫博物院" ? { ...card, id: "故宫" } : card));
  const failed = checkExpectations(beijing, capture(saved), buildHandoff(beijing, "2026-11-16"))
    .filter(({ passed }) => !passed).map(({ name }) => name);
  assert.deepEqual(failed, ["reservation found for 故宫", "故宫 not on weekday 1", "no empty days"]);
});

test("a run without a saved plan fails one expectation that says why", () => {
  const results = checkExpectations(beijing, { events: [], run: { status: "failed", errorCode: "time_limit", usage: null, durationMs: 1 }, plan: null },
    buildHandoff(beijing, "2026-11-16"));
  assert.deepEqual(results, [{ name: "plan saved", passed: false, detail: "run failed (time_limit)" }]);
});
