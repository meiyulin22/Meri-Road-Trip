import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { card } from "@/agents/planner/plan-test-fixtures";
import { parseHotelSearch } from "@/platform/hotel/rollinggo";

import type { PlanDay } from "./plan-draft";
import { pickTiers, stayBlocks } from "./stays";

const located = (name: string, longitude: number, latitude: number) =>
  ({ ...card(name), mapCheck: { status: "located" as const, district: "古城区", point: { longitude, latitude } } });
const town = located("丽江古城", 100.234, 26.872);
const mufu = located("木府", 100.233, 26.870);
const lake = located("黑龙潭", 100.237, 26.884);
const mountain = located("玉龙雪山", 100.183, 27.100);
const dali = { ...card("洱海"), city: "大理白族自治州", id: "erhai", mapCheck: { status: "not_located" as const } };
const cards = new Map([town, mufu, lake, mountain, dali].map((item) => [item.id, item]));
const day = (number: number, city: string, ...spots: string[]): PlanDay => ({
  day: number, date: `2026-11-${25 + number}`, province: "云南省", city, arrivingFrom: null, focus: null, theme: null,
  stops: spots.map((spotId) => ({ spotId, slot: "morning" as const, anchor: null })),
});

test("one stay a city run; the last day goes home, so it has no night", () => {
  const blocks = stayBlocks([
    day(1, "大理白族自治州", dali.id), day(2, "大理白族自治州"), day(3, "丽江市", town.id, mufu.id), day(4, "丽江市", mountain.id, lake.id),
  ], cards);
  assert.deepEqual(blocks.map(({ city, checkIn, nights, firstDay, lastDay, near }) => [city, checkIn, nights, firstDay, lastDay, near]), [
    ["大理白族自治州", "2026-11-26", 2, 1, 2, { name: "大理白族自治州", kind: "city" }],
    // The stop in the middle of 丽江's located stops, not the mountain far north.
    ["丽江市", "2026-11-28", 1, 3, 4, { name: "丽江古城", kind: "spot" }],
  ]);
});

test("a one-day trip, or a day without a date, makes no stay", () => {
  assert.deepEqual(stayBlocks([day(1, "丽江市", town.id)], cards), []);
  assert.deepEqual(stayBlocks([{ ...day(1, "丽江市"), date: null }, { ...day(2, "丽江市"), date: null }], cards), []);
});

test("three tiers from the recorded search: the nearest priced hotel in each", () => {
  const hotels = parseHotelSearch(JSON.parse(readFileSync(join(import.meta.dirname, "../../platform/hotel/fixtures/rollinggo-search-lijiang-gucheng-2026-11-28.json"), "utf8")));
  assert.ok(hotels);
  assert.deepEqual(pickTiers(hotels).map(({ tier, hotel }) => [tier, hotel.name]), [
    ["budget", "尚客优快捷酒店(丽江古城南门店)"],
    // 3–4 stars: 呈境 at 799 m is nearer than 阿丹阁 and 花筑.
    ["comfort", "呈境LIFE HOTEL(丽江古城南门木府店)"],
    ["luxury", "丽江古城南门檀程·纪酒店"],
  ]);
  assert.deepEqual(pickTiers(hotels.filter(({ star }) => star === 4)).map(({ tier }) => tier), ["comfort"]);
  assert.deepEqual(pickTiers([]), []);
});
