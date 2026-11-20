import assert from "node:assert/strict";
import test from "node:test";

import { poorDaysOn, routeChoice } from "./route-weather";

const dali = { longitude: 100.27, latitude: 25.61 };
const lijiang = { longitude: 100.23, latitude: 26.86 };
const diqing = { longitude: 99.71, latitude: 27.83 };
const kunming = { longitude: 102.71, latitude: 25.04 };
const points = new Map([["大理白族自治州", dali], ["丽江市", lijiang], ["迪庆藏族自治州", diqing], ["昆明市", kunming]]);
const dates = ["2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27"];
// The first live run, 2026-11-20: a thunderstorm in 丽江 on the 24th; 大理 only wet, which is not poor.
const stormy = new Map([["丽江市", new Set(["2026-11-24"])], ["大理白族自治州", new Set<string>()]]);

test("each city's days take the dates in order; a transfer day counts like any other", () => {
  assert.deepEqual(poorDaysOn([{ city: "丽江市", days: 2 }, { city: "大理白族自治州", days: 2 }], dates, stormy),
    [{ city: "丽江市", date: "2026-11-24" }]);
  assert.deepEqual(poorDaysOn([{ city: "大理白族自治州", days: 2 }, { city: "丽江市", days: 2 }], dates, stormy), []);
  assert.deepEqual(poorDaysOn([{ city: "大理白族自治州", days: 2 }], [null, null], stormy), []);
});

test("two cities the same distance apart: the order with fewer poor days is best, each city keeping its days", () => {
  const choice = routeChoice([{ city: "丽江市", days: 2 }, { city: "大理白族自治州", days: 2 }], dates, stormy, points, null);
  assert.equal(choice?.tooLong, false);
  assert.deepEqual(choice?.current.poor, [{ city: "丽江市", date: "2026-11-24" }]);
  assert.deepEqual(choice?.best.order, ["大理白族自治州", "丽江市"]);
  assert.deepEqual(choice?.best.poor, []);
});

test("weather never buys an order more than 30% longer", () => {
  // From 昆明 and back, 丽江 first on its stormy day is the short way; 迪庆 first doubles back.
  const wet = new Map([["丽江市", new Set(["2026-11-25"])]]);
  const choice = routeChoice([{ city: "大理白族自治州", days: 1 }, { city: "丽江市", days: 1 }, { city: "迪庆藏族自治州", days: 1 }],
    dates, wet, points, kunming);
  assert.equal(choice?.tooLong, false);
  // 大理 → 迪庆 → 丽江 would keep 丽江 off the 25th, but it runs well over 30% longer, so it is not offered.
  assert.notDeepEqual(choice?.best.order, ["大理白族自治州", "迪庆藏族自治州", "丽江市"]);
  assert.ok((choice?.best.km ?? Infinity) <= (choice?.shortestKm ?? 0) * 1.3 + 5);
});

test("a tie keeps the Plan Agent's order; a route too long gets the best order within 30%", () => {
  const tie = routeChoice([{ city: "大理白族自治州", days: 2 }, { city: "丽江市", days: 2 }], dates, new Map(), points, null);
  assert.deepEqual(tie?.best.order, ["大理白族自治州", "丽江市"]);
  const zigzag = routeChoice([{ city: "大理白族自治州", days: 1 }, { city: "迪庆藏族自治州", days: 1 }, { city: "丽江市", days: 2 }],
    dates, new Map([["迪庆藏族自治州", new Set(["2026-11-24"])]]), points, null);
  assert.equal(zigzag?.tooLong, true);
  // Of the two shortest orders, the one that keeps 迪庆 off the 24th.
  assert.deepEqual(zigzag?.best.order, ["大理白族自治州", "丽江市", "迪庆藏族自治州"]);
  assert.deepEqual(zigzag?.best.poor, []);
});
