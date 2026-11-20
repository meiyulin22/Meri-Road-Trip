import assert from "node:assert/strict";
import test from "node:test";

import { card } from "@/agents/planner/plan-test-fixtures";
import type { PlanDay } from "@/domain/plan/plan-draft";
import type { DayForecast, SpotWeather } from "@/domain/plan/weather";

import { dayWeather, hasForecast, stopWeather } from "./plan-weather-view";

const on = (date: string, overrides: Partial<DayForecast> = {}): DayForecast => ({
  date, code: 1, high: 16, low: 2, precipitationMm: 0, precipitationChance: 0, snowfallCm: 0, gustKmh: 20, ...overrides,
});
const town: SpotWeather = { status: "forecast", source: "spot", elevation: 2454, beyond: ["2026-12-10"],
  days: [on("2026-11-24", { code: 95, precipitationMm: 22.5, high: 12, low: 5 })] };
const mountain: SpotWeather = { status: "forecast", source: "spot", elevation: 5026, beyond: [],
  days: [on("2026-11-24", { code: 2, high: -1, low: -11, gustKmh: 40 })] };
const cards = [
  { ...card("丽江古城"), outdoor: true, weather: town },
  { ...card("木府"), outdoor: false, weather: town },
  { ...card("玉龙雪山"), outdoor: true, weather: mountain },
];
const planDay = (date: string | null): PlanDay => ({
  day: 1, date, province: "云南省", city: "丽江市", arrivingFrom: null, focus: null, theme: null, stops: [],
});

test("the day heads with the town's forecast, which most of the city's spots share", () => {
  assert.deepEqual(dayWeather(planDay("2026-11-24"), cards), { kind: "forecast", line: {
    sky: "thunderstorm", low: 5, high: 12, rainMm: 22.5, outdoor: "poor", reasons: ["thunderstorm"],
  } });
  assert.deepEqual(dayWeather(planDay("2026-12-10"), cards), { kind: "beyond" });
  assert.equal(dayWeather(planDay(null), cards), null);
  assert.equal(dayWeather(planDay("2026-11-24"), cards.map((item) => ({ ...item, weather: undefined }))), null);
});

test("an outdoor stop shows its own forecast when the day is poor there or it sits far above the town", () => {
  assert.equal(stopWeather(cards[0], "2026-11-24", cards)?.outdoor, "poor");
  assert.equal(stopWeather(cards[1], "2026-11-24", cards), null);
  assert.deepEqual(stopWeather(cards[2], "2026-11-24", cards)?.low, -11);
  const calmTown = { ...cards[0], weather: { ...town, days: [on("2026-11-24")] } as SpotWeather };
  assert.equal(stopWeather(calmTown, "2026-11-24", [calmTown]), null);
});

test("the credit shows whenever a card carries weather", () => {
  assert.equal(hasForecast(cards), true);
  assert.equal(hasForecast([card("丽江古城")]), false);
  assert.equal(hasForecast([{ ...card("丽江古城"), weather: { status: "beyond_range" } }]), true);
});
