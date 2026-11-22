import assert from "node:assert/strict";
import test from "node:test";

import { MockLanguageModelV3 } from "ai/test";

import { card, fiveDays, handoff as handoffFor } from "@/agents/planner/plan-test-fixtures";
import type { ReadyPlan } from "@/domain/plan/plan-draft-response";
import type { SpotCard } from "@/domain/plan/spot-card";
import { InMemoryPlanRunRepository } from "@/platform/persistence/in-memory/in-memory-plan-run-repository";
import type { WeatherForecast } from "@/platform/weather/weather-forecast";

import { handoffKey } from "./plan-run-service";
import { handleWeatherRefreshPost, refreshPlanWeather, type WeatherRefreshDependencies } from "./plan-weather-refresh";

const tripId = "3d17d2c7-fd9b-4748-b751-3a76a9a920be";
const runId = "00000000-0000-4000-8000-000000000001";
const owner = "85cbd49a-25fa-4942-aa49-4d01cf63023f";
const handoff = handoffFor(["丽江市"], fiveDays);
const located = (name: string, longitude: number): SpotCard => ({
  ...card(name), mapCheck: { status: "located", district: "古城区", point: { longitude, latitude: 26.87 } }, weather: { status: "unavailable" },
});
const spots = [located("丽江古城", 100.23), located("玉龙雪山", 100.18)];
const plan: ReadyPlan = {
  status: "ready",
  draft: { mode: "full", totalDays: 2, route: { source: "agent", cities: [], omitted: [] }, conflicts: [], unverified: [], days: [
    { day: 1, date: "2026-11-24", province: "云南省", city: "丽江市", arrivingFrom: null, focus: null, theme: null,
      stops: [{ spotId: spots[0].id, slot: "morning", anchor: null }] },
    { day: 2, date: "2026-11-25", province: "云南省", city: "丽江市", arrivingFrom: null, focus: null, theme: null,
      stops: [{ spotId: spots[1].id, slot: "morning", anchor: null }] },
  ] },
  spots, cities: [{ province: "云南省", city: "丽江市", status: "ready" }], pendingProvinces: [], dayPhotos: [], mapCheck: "complete",
};

const sunny: WeatherForecast = async (points, range) => ({
  status: "ok", provider: "met-norway", points: points.map(() => ({ elevation: 2400, days: ["2026-11-24", "2026-11-25"]
    .filter((date) => date >= range.from && date <= range.to)
    .map((date) => ({ date, code: 1, high: 14, low: 2, precipitationMm: 0, precipitationChance: null, snowfallCm: 0, gustKmh: 20, wetHours: 0, estimated: true as const })) })),
});
// The outfit additions answer with nothing to add, so only the basics show.
const quietModel = () => new MockLanguageModelV3({ doGenerate: async () => ({
  content: [{ type: "text", text: JSON.stringify({ days: [] }) }], finishReason: { unified: "stop", raw: "stop" },
  usage: { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, text: 5, reasoning: 0 } }, warnings: [],
}) });

function setup(forecast: WeatherForecast, current = handoff.tripState) {
  const repository = new InMemoryPlanRunRepository();
  repository.runs.set(runId, { id: runId, tripId, status: "succeeded", handoff, handoffKey: handoffKey(handoff),
    errorCode: null, usage: null, startedAt: "2026-11-17T08:00:00.000Z", finishedAt: "2026-11-17T08:01:00.000Z", durationMs: 60_000 });
  repository.versions.push({ id: "00000000-0000-4000-8000-000000000002", tripId, runId, version: 1, tripState: handoff.tripState,
    preferences: [], plan, createdAt: "2026-11-17T08:01:00.000Z" });
  const deps: WeatherRefreshDependencies = {
    loadJourney: async () => ({ tripState: current }), repository, forecast,
    cityCentre: async () => null, planModel: { model: quietModel }, now: () => new Date("2026-11-22T02:00:00.000Z"),
  };
  return { repository, deps };
}

test("「重新查天气」 gives the saved plan its forecasts and outfits, in the same version, with the route unchanged", async () => {
  const { repository, deps } = setup(sunny);
  const outcome = await refreshPlanWeather(tripId, owner, deps);
  assert.equal(outcome.status, "refreshed");
  const saved = repository.versions[0];
  assert.equal(repository.versions.length, 1);
  assert.ok(saved.plan.spots.every(({ weather }) => weather?.status === "forecast" && weather.provider === "met-norway"));
  assert.deepEqual(saved.plan.draft.outfits?.map(({ day }) => day), [1, 2]);
  assert.deepEqual(saved.plan.draft.days, plan.draft.days);
  assert.equal(repository.runs.size, 1);
});

test("still no weather, no dates, a changed journey or no plan: nothing is saved, and the page hears why", async () => {
  const lost: WeatherForecast = async () => ({ status: "failure", reason: "network" });
  const failing = setup(lost);
  assert.equal((await refreshPlanWeather(tripId, owner, failing.deps)).status, "no_weather");
  assert.deepEqual(failing.repository.versions[0].plan, plan);
  const response = await handleWeatherRefreshPost(tripId, owner, failing.deps, () => false);
  assert.equal(response.status, 503);

  const undated = setup(sunny);
  undated.repository.versions[0] = { ...undated.repository.versions[0], plan: { ...plan, draft: { ...plan.draft,
    days: plan.draft.days.map((day) => ({ ...day, date: null })) } } };
  assert.equal((await refreshPlanWeather(tripId, owner, undated.deps)).status, "no_dates");

  const changed = { ...handoff.tripState, duration: { state: "known" as const, value: "6天", source: "user" as const } };
  assert.equal((await refreshPlanWeather(tripId, owner, setup(sunny, changed).deps)).status, "plan_stale");

  const empty = setup(sunny);
  empty.repository.versions.length = 0;
  assert.equal((await refreshPlanWeather(tripId, owner, empty.deps)).status, "no_plan");
  assert.equal((await handleWeatherRefreshPost(tripId, null, empty.deps, () => false)).status, 404);
});
