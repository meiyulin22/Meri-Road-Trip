import assert from "node:assert/strict";
import test from "node:test";

import { fallbackRoute, planScope, reorderRoute } from "./plan-draft";
import { pathKm, shortestOrder } from "./route-distance";
import { routeChoice } from "./route-weather";
import type { TripState } from "@/domain/trip-state/trip-state";

// City centres, roughly: 昆明, 大理, 丽江, 迪庆 run south to north in Yunnan.
const kunming = { longitude: 102.71, latitude: 25.04 };
const dali = { longitude: 100.27, latitude: 25.61 };
const lijiang = { longitude: 100.23, latitude: 26.86 };
const diqing = { longitude: 99.71, latitude: 27.83 };
const points = new Map([["昆明市", kunming], ["大理白族自治州", dali], ["丽江市", lijiang], ["迪庆藏族自治州", diqing]]);

test("the shortest order runs south to north; with the origin it starts and ends nearest home", () => {
  const best = shortestOrder([lijiang, kunming, diqing, dali], null);
  const names = ["丽江", "昆明", "迪庆", "大理"];
  const order = best.order.map((index) => names[index]);
  assert.ok(order.join() === "昆明,大理,丽江,迪庆" || order.join() === "迪庆,丽江,大理,昆明");
  assert.ok(Math.abs(best.km - pathKm([kunming, dali, lijiang, diqing], null)) < 1e-6);
});

const days = (...cities: string[]) => cities.map((city) => ({ city, days: 1 }));
const fourDates = ["2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27"];
const dry = new Map<string, Set<string>>();

test("an order zig-zagging over 30% longer is too long; a small swap is not", () => {
  const zigzag = routeChoice(days("丽江市", "昆明市", "迪庆藏族自治州", "大理白族自治州"), fourDates, dry, points, null);
  assert.ok(zigzag?.tooLong);
  assert.ok(zigzag.current.km > zigzag.shortestKm * 1.3);
  const swap = routeChoice(days("昆明市", "丽江市", "大理白族自治州"), fourDates, dry, points, null);
  assert.equal(swap?.tooLong, false);
  // Dry everywhere: the order already within 30% is kept.
  assert.deepEqual(swap?.best.order, ["昆明市", "丽江市", "大理白族自治州"]);
});

test("nothing is measured for one city or a city without a centre", () => {
  assert.equal(routeChoice(days("丽江市"), fourDates, dry, points, null), null);
  assert.equal(routeChoice(days("丽江市", "上海市"), fourDates, dry, points, null), null);
});

test("more cities than the exact limit still find a short order", () => {
  const many = Array.from({ length: 10 }, (_, index) => ({ longitude: 100 + index * 0.3, latitude: 25 + (index % 2) * 0.01 }));
  const shuffled = [many[5], many[0], many[9], many[2], many[7], many[1], many[8], many[3], many[6], many[4]];
  const best = shortestOrder(shuffled, null);
  assert.ok(best.km <= pathKm(many, null) * 1.01);
});

test("reordering keeps each city's days, focus and theme, and moves the transfer day", () => {
  const tripState = {
    name: { state: "missing" }, origin: { state: "missing" },
    destination: { state: "known", source: "user", areas: [{ province: "云南省", places: [
      { name: "丽江市", spots: [] }, { name: "大理白族自治州", spots: [] },
    ] }] },
    startDate: { state: "known", value: "2026-11-24", source: "user" }, endDate: { state: "missing" },
    duration: { state: "known", value: "5天", source: "user" }, transportPreference: { state: "missing" },
  } as TripState;
  const scope = planScope(tripState);
  if (scope.status !== "ready") throw new Error("expected a ready scope");
  const base = fallbackRoute(scope);
  const themed = { ...base, frames: base.frames.map((frame) => ({ ...frame, theme: `${frame.city}-${frame.day}` })) };
  const reordered = reorderRoute(themed, ["大理白族自治州", "丽江市"], scope.dates);
  assert.deepEqual(reordered.route.cities.map(({ city, days }) => [city, days]), [["大理白族自治州", 2], ["丽江市", 3]]);
  assert.deepEqual(reordered.frames.map(({ day, date, city, arrivingFrom, theme }) => [day, date, city, arrivingFrom, theme]), [
    [1, "2026-11-24", "大理白族自治州", null, "大理白族自治州-4"],
    [2, "2026-11-25", "大理白族自治州", null, "大理白族自治州-5"],
    [3, "2026-11-26", "丽江市", "大理白族自治州", "丽江市-1"],
    [4, "2026-11-27", "丽江市", null, "丽江市-2"],
    [5, "2026-11-28", "丽江市", null, "丽江市-3"],
  ]);
});
