import assert from "node:assert/strict";
import test from "node:test";

import { card } from "@/agents/planner/plan-test-fixtures";

import { baseOutfit, checkedAdditions, dayForecasts, packingList, type PlaceForecast } from "./outfit";
import type { PlanDay } from "./plan-draft";
import type { DayForecast, SpotWeather } from "./weather";

const on = (overrides: Partial<DayForecast> = {}): DayForecast => ({
  date: "2026-11-25", code: 1, high: 14, low: 2, precipitationMm: 0, precipitationChance: 0, snowfallCm: 0, gustKmh: 20, ...overrides,
});
const planDay = (stops: string[] = [], date: string | null = "2026-11-25"): PlanDay => ({
  day: 2, date, province: "云南省", city: "丽江市", arrivingFrom: null, focus: null, theme: null,
  stops: stops.map((spotId) => ({ spotId, slot: "morning" as const, anchor: null })),
});
const at = (place: string, forecast: DayForecast, elevation: number | null = 2400, own = true): PlaceForecast => ({ place, elevation, own, forecast });
const ids = (outfit: ReturnType<typeof baseOutfit>) => outfit?.items.map(({ id }) => id);

test("layers follow the coldest point of the day, as agreed", () => {
  assert.deepEqual(ids(baseOutfit(planDay(), [at("古城", on({ code: 3, low: 21, high: 30 }))])), ["tshirt", "trousers", "walking_shoes"]);
  assert.deepEqual(ids(baseOutfit(planDay(), [at("古城", on({ low: 12, high: 20 }))])), ["long_sleeve", "windbreaker", "trousers", "walking_shoes"]);
  assert.deepEqual(ids(baseOutfit(planDay(), [at("古城", on({ low: 5, high: 14 }))])), ["long_sleeve", "fleece", "shell_jacket", "trousers", "walking_shoes"]);
  assert.deepEqual(ids(baseOutfit(planDay(), [at("古城", on({ low: 0, high: 9 }))])), ["thermal_top", "fleece", "down_jacket", "trousers", "walking_shoes"]);
});

test("玉龙雪山 at −11° and 5369 m above the old town at 2°: down, warm extras, sun protection, and a swing reminder", () => {
  // From the live run of 2026-11-20.
  const outfit = baseOutfit(planDay(), [
    at("玉龙雪山", on({ code: 45, low: -11, high: -2, gustKmh: 37 }), 5369),
    at("丽江古城", on({ code: 51, low: 2, high: 14, precipitationMm: 2.1 }), 2403),
  ]);
  assert.deepEqual(outfit?.coldest, { temp: -11, place: "玉龙雪山" });
  assert.deepEqual(outfit?.warmest, { temp: 14, place: "丽江古城" });
  assert.deepEqual(ids(outfit), [
    "thermal_top", "fleece", "down_jacket", "trousers", "thermal_pants", "walking_shoes", "beanie", "sunglasses", "gloves", "sunscreen",
  ]);
  assert.deepEqual(outfit?.items.find(({ id }) => id === "sunglasses")?.reasons, [{ kind: "altitude", metres: 5369, place: "玉龙雪山" }]);
  assert.equal(outfit?.bigSwing, true);
});

test("rain brings an umbrella; a thunderstorm or a gale brings a shell and, in a storm, waterproof shoes instead", () => {
  assert.ok(ids(baseOutfit(planDay(), [at("古城", on({ low: 14, high: 20, precipitationMm: 6 }))]))?.includes("umbrella"));
  assert.ok(ids(baseOutfit(planDay(), [at("古城", on({ low: 14, high: 20, precipitationChance: 60 }))]))?.includes("umbrella"));
  const storm = baseOutfit(planDay(), [at("古城", on({ code: 95, low: 6, high: 12, precipitationMm: 22.5 }))]);
  assert.deepEqual(ids(storm), ["long_sleeve", "fleece", "shell_jacket", "trousers", "waterproof_shoes"]);
  assert.deepEqual(storm?.items.find(({ id }) => id === "shell_jacket")?.reasons, [{ kind: "cold", temp: 6, place: "古城" }, { kind: "storm", mm: 22.5 }]);
  const gale = baseOutfit(planDay(), [at("雪山", on({ low: 14, high: 18, gustKmh: 64, precipitationMm: 8 }))]);
  assert.deepEqual(ids(gale), ["long_sleeve", "windbreaker", "shell_jacket", "trousers", "walking_shoes"]);
});

test("snow brings waterproof shoes and gloves; strong sun a hat and sunscreen", () => {
  const snow = baseOutfit(planDay(), [at("雪山", on({ code: 73, low: 1, high: 4, snowfallCm: 2 }))]);
  assert.ok(ids(snow)?.includes("waterproof_shoes") && ids(snow)?.includes("gloves") && !ids(snow)?.includes("walking_shoes"));
  const sun = baseOutfit(planDay(), [at("洱海", on({ code: 0, low: 20, high: 27 }))]);
  assert.deepEqual(ids(sun), ["tshirt", "trousers", "walking_shoes", "sun_hat", "sunscreen"]);
  assert.equal(sun?.bigSwing, false);
});

test("no date or no forecast, no outfit", () => {
  assert.equal(baseOutfit(planDay([], null), [at("古城", on())]), null);
  assert.equal(baseOutfit(planDay(), []), null);
});

test("each stop's own forecast is used; with none, the city's weather", () => {
  const weather = (low: number, elevation: number, source: "spot" | "city" = "spot"): SpotWeather =>
    ({ status: "forecast", source, elevation, beyond: [], days: [on({ low })] });
  const town = { ...card("丽江古城"), weather: weather(2, 2403) };
  const mountain = { ...card("玉龙雪山"), weather: weather(-11, 5369) };
  const lake = { ...card("黑龙潭"), weather: weather(3, 2400, "city") };
  const cards = new Map([town, mountain, lake].map((item) => [item.id, item]));
  assert.deepEqual(dayForecasts(planDay([mountain.id, lake.id]), cards).map(({ place }) => place), ["玉龙雪山", "丽江市"]);
  // A day with no stop, or no forecast at its stops, takes the city's weather.
  assert.deepEqual(dayForecasts(planDay([]), cards).map(({ place, forecast }) => [place, forecast.low]), [["丽江市", 2]]);
  assert.deepEqual(dayForecasts(planDay([], null), cards), []);
});

test("the Plan Agent's additions are checked: four at most, short, a known slot, no repeats", () => {
  const base = baseOutfit(planDay(), [at("玉龙雪山", on({ low: -11, high: -2 }), 5369)]);
  assert.ok(base);
  const { extras, tip } = checkedAdditions(base, {
    day: 2,
    extras: [
      { name: "护膝", slot: "legs", reason: "雪山栈道上下台阶多" },
      { name: "羽绒服", slot: "outer", reason: "repeats a base item" },
      { name: "暖宝宝", slot: "bag", reason: "索道上 4500 m 风大" },
      { name: "暖宝宝", slot: "bag", reason: "twice" },
      { name: "一顶特别特别长名字的帽子", slot: "head", reason: "too long" },
      { name: "冰爪", slot: "shoes", reason: "not a slot" },
      { name: "保温杯", slot: "bag", reason: "" },
      { name: "润唇膏", slot: "face", reason: "高原干燥" },
      { name: "氧气瓶", slot: "bag", reason: "4506 m 以上可能缺氧" },
      { name: "第五样", slot: "bag", reason: "one too many" },
    ],
    tip: "  上午先上雪山，羽绒服可以在山下租。  ",
  });
  assert.deepEqual(extras.map(({ name }) => name), ["护膝", "暖宝宝", "润唇膏", "氧气瓶"]);
  assert.equal(tip, "上午先上雪山，羽绒服可以在山下租。");
  assert.deepEqual(checkedAdditions(base, undefined), { extras: [], tip: null });
  // A basic not worn that day is still code's to decide.
  const named = checkedAdditions(base, { day: 2, extras: [
    { name: "Umbrella", slot: "bag", reason: "rain later" }, { name: "Rain shell", slot: "outer", reason: "wet" },
    { name: "雨伞", slot: "bag", reason: "下雨" }, { name: "遮阳帽", slot: "head", reason: "晒" }, { name: "暖宝宝", slot: "bag", reason: "冷" },
  ] });
  assert.deepEqual(named.extras.map(({ name }) => name), ["暖宝宝"]);
  assert.deepEqual(checkedAdditions(base, { day: 2, extras: "nonsense", tip: 3 }), { extras: [], tip: null });
});

test("the packing list gathers each thing and the days it is worn", () => {
  const first = baseOutfit({ ...planDay(), day: 1 }, [at("古城", on({ low: 6, high: 12 }))]);
  const second = baseOutfit(planDay(), [at("雪山", on({ low: -11, high: -2 }), 5369)]);
  assert.ok(first && second);
  const list = packingList([
    { ...first, extras: [{ name: "暖宝宝", slot: "bag", reason: "冷" }], tip: null },
    { ...second, extras: [{ name: "暖宝宝", slot: "bag", reason: "冷" }], tip: null },
  ]);
  assert.deepEqual(list.base.find(({ id }) => id === "fleece")?.days, [1, 2]);
  assert.deepEqual(list.base.find(({ id }) => id === "down_jacket")?.days, [2]);
  assert.deepEqual(list.extras, [{ name: "暖宝宝", slot: "bag", days: [1, 2] }]);
});

test("altitude counts only at a stop's own point, never at the city's weather point", () => {
  // 2026-11-20: Tianditu's centre for 大理白族自治州 sat at 3,304 m and asked for sunglasses in town.
  const city = baseOutfit(planDay(), [at("大理白族自治州", on({ code: 3, low: 6, high: 17 }), 3304, false)]);
  assert.equal(ids(city)?.includes("sunglasses"), false);
  const own = baseOutfit(planDay(), [at("玉龙雪山", on({ code: 3, low: -8, high: -1 }), 4506, true)]);
  assert.equal(ids(own)?.includes("sunglasses"), true);
});
