import assert from "node:assert/strict";
import test from "node:test";

import { fallbackRoute, planScope, type PlanScope } from "@/domain/plan/plan-draft";

import { draftCityDays } from "./plan-days";
import { afternoon, dali, day, fiveDays, handoff, lijiang, modelAnswering, sevenDays } from "./plan-test-fixtures";

function framesFor(places: readonly string[], duration: Parameters<typeof handoff>[1]) {
  const trip = handoff(places, duration);
  const scope: PlanScope = planScope(trip.tripState);
  if (scope.status !== "ready") throw new Error("expected a ready scope");
  return { trip, scope, frames: fallbackRoute(scope).frames };
}

const spotNames = (ids: readonly { spotId: string }[]) => ids.map(({ spotId }) => JSON.parse(spotId)[2]);

test("without a confirmed duration, plans one preview day and shows the model the map's districts", async () => {
  const { trip, scope, frames } = framesFor(["丽江市", "大理白族自治州"], { state: "missing" });
  const dayPrompts: unknown[] = [];
  const result = await draftCityDays(trip, scope.mode, frames, lijiang.spots, {
    model: modelAnswering({ days: [[day(1, "s2", "s3")]], dayPrompts }),
  });

  assert.equal(result.status, "ready");
  if (result.status !== "ready") return;
  assert.deepEqual(result.days.map(({ city, stops }) => [city, spotNames(stops)]), [["丽江市", ["玉龙雪山", "丽江古城"]]]);
  assert.equal(result.attempts, 1);
  assert.deepEqual(result.usage, { inputTokens: 100, outputTokens: 20 });
  assert.equal((dayPrompts[0] as { mode: string }).mode, "preview");
  const candidates = (dayPrompts[0] as { candidates: { name: string; located: boolean; district: string | null }[] }).candidates;
  assert.deepEqual(candidates.slice(0, 2).map(({ name, located, district }) => [name, located, district]),
    [["黑龙潭", true, "古城区"], ["玉龙雪山", false, null]]);
});

test("a single city with seven confirmed days gets exactly seven days", async () => {
  const { trip, scope, frames } = framesFor(["丽江市"], sevenDays);
  const week = [day(1, "s1"), day(2, "s2"), day(3, "s3"), day(4, "s4"), day(5, "s5"), day(6, "s6"), day(7, "s7", "s8")];
  const result = await draftCityDays(trip, scope.mode, frames, lijiang.spots, { model: modelAnswering({ days: [week] }) });

  assert.equal(result.status, "ready");
  if (result.status !== "ready") return;
  assert.deepEqual(result.days.map(({ day: dayNumber, stops }) => [dayNumber, stops.length]),
    [[1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 2]]);
});

test("returns the problems once, then keeps what holds", async () => {
  const { trip, scope, frames } = framesFor(["丽江市"], sevenDays);
  const dayPrompts: unknown[] = [];
  const missingRequested = [day(1, "s2"), day(2, "s3"), day(3, "s4"), day(4, "s5"), day(5, "s6"), day(6, "s7"), day(7, "s8", "s99")];
  const attempts: number[] = [];
  const result = await draftCityDays(trip, scope.mode, frames, lijiang.spots, {
    model: modelAnswering({ days: [missingRequested, missingRequested], dayPrompts }),
  }, ({ attempt }) => attempts.push(attempt));

  assert.equal(result.status, "ready");
  if (result.status !== "ready") return;
  assert.equal(result.attempts, 2);
  assert.deepEqual(attempts, [1, 2]);
  assert.deepEqual((dayPrompts[1] as { problemsWithPreviousAnswer: string[] }).problemsWithPreviousAnswer, [
    "Day 7: s99 is not a candidate in 丽江市.",
    "黑龙潭 was requested by the user and is not scheduled.",
  ]);
  assert.equal(result.days[6].stops.length, 1);
});

test("keeps the first reviewed proposal when the retry fails, and reports an unreachable model", async () => {
  const { trip, scope, frames } = framesFor(["丽江市"], sevenDays);
  const kept = await draftCityDays(trip, scope.mode, frames, lijiang.spots, { model: modelAnswering({ days: [[day(1, "s2")]] }) });
  assert.equal(kept.status, "ready");
  if (kept.status !== "ready") return;
  assert.equal(kept.attempts, 2);
  assert.equal(kept.days[0].stops.length, 1);

  assert.deepEqual(await draftCityDays(trip, scope.mode, frames, lijiang.spots, { model: modelAnswering() }),
    { status: "unavailable" });
});

test("a city's transfer day keeps its stops after the arrival, and a city without cards needs no model", async () => {
  const { trip, scope, frames } = framesFor(["丽江市", "大理白族自治州"], fiveDays);
  const daliFrames = frames.filter(({ city }) => city === "大理白族自治州");
  assert.equal(daliFrames[0].arrivingFrom, "丽江市");
  const result = await draftCityDays(trip, scope.mode, daliFrames, dali.spots, {
    model: modelAnswering({ days: [[afternoon(day(4, "s1", "s2")), day(5, "s3")]] }),
  });
  assert.equal(result.status, "ready");
  if (result.status !== "ready") return;
  assert.deepEqual(result.days.map(({ day: dayNumber, stops }) => [dayNumber, stops.length]), [[4, 2], [5, 1]]);

  const empty = await draftCityDays(trip, scope.mode, daliFrames, [], {
    model() {
      assert.fail("A city without candidates should not reach the model");
    },
  });
  assert.deepEqual(empty.status === "ready" && empty.days.map(({ stops }) => stops.length), [0, 0]);
});
