import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { card } from "@/agents/planner/plan-test-fixtures";
import { parseHotelSearch } from "@/platform/hotel/rollinggo";

import type { PlanDay } from "./plan-draft";
import { bigAreaStops, pickTiers, stayBlocks, stayNear, staySegments } from "./stays";

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

test("a stop the road never reaches, such as a lake, is not searched near (1.2117)", () => {
  // 2026-11-21: 大理's hotels read 5 to 20 km from 洱海, whose point sits mid-lake.
  const leg = (from: string, to: string, start: number, end: number) => ({
    day: 3, fromSpotId: from, toSpotId: to, mode: "drive" as const, distanceKm: 5, durationMinutes: 10,
    path: [[100, 26], [100.1, 26.1]] as [number, number][], offRoadStartMeters: start, offRoadEndMeters: end,
  });
  const areas = bigAreaStops([leg(town.id, lake.id, 50, 1_700), leg(mufu.id, town.id, 20, 30)]);
  assert.deepEqual([...areas], [lake.id]);
  const [lijiang] = stayBlocks([day(3, "丽江市", lake.id, town.id), day(4, "丽江市")], cards, areas);
  assert.equal(lijiang.near.name, "丽江古城");
  const [only] = stayBlocks([day(3, "丽江市", lake.id), day(4, "丽江市")], cards, areas);
  assert.deepEqual(only.near, { name: "丽江市", kind: "city" });
});

test("a stay searches near the guides' stay area closest to the middle of its stops, within 50 km (RAG step 5)", () => {
  const areas = [
    { name: "束河古镇", features: ["院落客栈", "青年旅舍"], spotName: "束河古镇", point: { longitude: 100.208, latitude: 26.92 } },
    { name: "大研古城", features: ["纳西院落"], spotName: "丽江古城", point: { longitude: 100.234, latitude: 26.872 } },
    { name: "大落水村", features: ["木楞房客栈"], spotName: "泸沽湖云南侧", point: { longitude: 100.78, latitude: 27.69 } },
  ];
  const run = [day(1, "丽江市", town.id, mufu.id), day(2, "丽江市", mountain.id, lake.id)];
  const chosen = stayNear(run, cards, "丽江市", new Set(), areas);
  // 玉龙雪山 pulls the middle north of the old town, so 束河 is the nearer area: searched there, not at 丽江古城.
  assert.deepEqual(chosen.near, { name: "束河古镇", kind: "spot", area: { name: "束河古镇", features: ["院落客栈", "青年旅舍"] } });
  assert.deepEqual(chosen.otherAreas?.map(({ name }) => name), ["大研古城", "大落水村"]);

  // Only areas far away (泸沽湖, about 100 km): the middle stop as before, the area still named.
  const far = stayNear(run, cards, "丽江市", new Set(), [areas[2]]);
  assert.deepEqual(far.near, { name: "丽江古城", kind: "spot" });
  assert.deepEqual(far.otherAreas?.map(({ name }) => name), ["大落水村"]);
  // No areas: exactly the old choice, nothing added.
  assert.deepEqual(stayNear(run, cards, "丽江市", new Set(), []), { near: { name: "丽江古城", kind: "spot" } });
});

test("a city splits its stays where the days move more than 50 km on (迪庆: 香格里拉, then 德钦)", () => {
  const temple = { ...located("松赞林寺", 99.70, 27.88), city: "迪庆藏族自治州", id: "temple" };
  const oldTown = { ...located("独克宗古城", 99.71, 27.82), city: "迪庆藏族自治州", id: "oldtown" };
  const view = { ...located("飞来寺观景区", 98.88, 28.47), city: "迪庆藏族自治州", id: "view" };
  const peak = { ...located("梅里雪山", 98.66, 28.43), city: "迪庆藏族自治州", id: "peak" };
  const diqing = new Map([temple, oldTown, view, peak].map((card) => [card.id, card]));
  const days = [day(1, "迪庆藏族自治州", temple.id, oldTown.id), day(2, "迪庆藏族自治州", view.id), day(3, "迪庆藏族自治州", peak.id)];
  assert.deepEqual(staySegments(days, diqing).map((segment) => segment.map(({ day: number }) => number)), [[1], [2, 3]]);

  const areas = new Map([["云南省|迪庆藏族自治州", [
    { name: "独克宗古城", features: ["古城客栈"], spotName: "独克宗古城", point: { longitude: 99.71, latitude: 27.82 } },
  ]]]);
  const blocks = stayBlocks(days, diqing, new Set(), areas);
  // Night 1 near 独克宗古城 (the guides' area); night 2 in 德钦, 180 km away, near its own middle stop. Day 3 goes home.
  assert.deepEqual(blocks.map(({ firstDay, nights, near }) => [firstDay, nights, near.area?.name ?? null, near.name]),
    [[1, 1, "独克宗古城", "独克宗古城"], [2, 1, null, "飞来寺观景区"]]);
});
