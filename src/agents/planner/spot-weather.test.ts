import assert from "node:assert/strict";
import test from "node:test";

import type { CityResearch } from "@/domain/plan/spot-card";
import type { GeoPoint } from "@/domain/plan/weather";
import type { WeatherForecast } from "@/platform/weather/weather-forecast";

import { addCityWeather, cityCentreLookup } from "./spot-weather";
import { lijiang } from "./plan-test-fixtures";

const oldTown = { longitude: 100.2299, latitude: 26.8721 };
const muFu = { longitude: 100.2330, latitude: 26.8700 };
const snowMountain = { longitude: 100.1836, latitude: 27.1006 };
const centre = { longitude: 100.227, latitude: 26.855 };

// 丽江古城 and 木府 located 300 m apart, 玉龙雪山 on the mountain, 黑龙潭 not located.
const city: CityResearch = {
  ...lijiang,
  spots: [
    { ...lijiang.spots[2], mapCheck: { status: "located", district: "古城区", point: oldTown } },
    { ...lijiang.spots[1], name: "木府", id: "mufu", mapCheck: { status: "located", district: "古城区", point: muFu } },
    { ...lijiang.spots[3], name: "玉龙雪山", id: "yulong", mapCheck: { status: "located", district: "玉龙县", point: snowMountain } },
    { ...lijiang.spots[0], mapCheck: { status: "not_located" } },
  ],
};

function forecastRecording(asked: { points: readonly GeoPoint[]; from: string; to: string }[]): WeatherForecast {
  return async (points, { from, to }) => {
    asked.push({ points, from, to });
    return { status: "ok", points: points.map((_, index) => ({
      elevation: index === 1 ? 5026 : 2454,
      days: ["2026-11-21", "2026-11-22", "2026-11-23"].map((date) => ({
        date, code: 1, high: index === 1 ? -1 : 16, low: index === 1 ? -11 : 2,
        precipitationMm: 0, precipitationChance: 0, snowfallCm: 0, gustKmh: 20,
      })),
    })) };
  };
}

test("one request a city: nearby spots share a point, the mountain has its own, unlocated spots use the centre", async () => {
  const asked: { points: readonly GeoPoint[]; from: string; to: string }[] = [];
  const progress: number[] = [];
  const { city: weathered, calls } = await addCityWeather(city, ["2026-11-22", "2026-11-23"], "2026-11-20", {
    forecast: forecastRecording(asked), cityCentre: async () => centre,
  }, ({ points }) => progress.push(points));

  assert.deepEqual(asked, [{ points: [oldTown, snowMountain, centre], from: "2026-11-22", to: "2026-11-23" }]);
  assert.equal(calls, 3);
  assert.deepEqual(progress, [3]);
  const [town, mufu, mountain, lake] = weathered.spots.map(({ weather }) => weather);
  assert.equal(town?.status === "forecast" && town.source, "spot");
  assert.deepEqual(mufu, town);
  assert.equal(mountain?.status === "forecast" && mountain.elevation, 5026);
  assert.equal(lake?.status === "forecast" && lake.source, "city");
  // Only the trip's own dates are kept.
  assert.deepEqual(town?.status === "forecast" && town.days.map(({ date }) => date), ["2026-11-22", "2026-11-23"]);
});

test("dates past the forecast's reach are marked; a trip far ahead asks nothing", async () => {
  const asked: { points: readonly GeoPoint[]; from: string; to: string }[] = [];
  const deps = { forecast: forecastRecording(asked), cityCentre: async () => centre };
  const partly = await addCityWeather(city, ["2026-12-05", "2026-12-06"], "2026-11-20", deps);
  assert.deepEqual(partly.city.spots[0].weather?.status === "forecast" && partly.city.spots[0].weather.beyond, ["2026-12-06"]);

  const later = await addCityWeather(city, ["2027-01-10"], "2026-11-20", deps);
  assert.deepEqual(later.city.spots.map(({ weather }) => weather), city.spots.map(() => ({ status: "beyond_range" })));
  assert.equal(later.calls, 0);
  assert.equal(asked.length, 1);
});

test("a trip without dates, or a deferred city, gets no weather and no request", async () => {
  const deps = { forecast: async () => { throw new Error("must not ask"); }, cityCentre: async () => centre };
  const undated = await addCityWeather(city, [null, null], "2026-11-20", deps);
  assert.equal(undated.city, city);
  const deferred = await addCityWeather({ ...city, status: "deferred" }, ["2026-11-22"], "2026-11-20", deps);
  assert.equal(deferred.calls, 0);
});

test("a failed forecast leaves the city's weather unavailable and the plan goes on", async () => {
  const { city: weathered } = await addCityWeather(city, ["2026-11-22"], "2026-11-20", {
    forecast: async () => ({ status: "failure", reason: "timeout" }), cityCentre: async () => centre,
  });
  assert.deepEqual(weathered.spots.map(({ weather }) => weather?.status), ["unavailable", "unavailable", "unavailable", "unavailable"]);
});

test("without a city centre the unlocated spot has no weather; the centre comes from memory, else one search under the run's stop", async () => {
  const { city: weathered } = await addCityWeather(city, ["2026-11-22"], "2026-11-20", {
    forecast: forecastRecording([]), cityCentre: async () => null,
  });
  assert.equal(weathered.spots[3].weather?.status, "unavailable");

  const searched: string[] = [];
  const stop = { stopped: false };
  const remembered = new Map<string, { name: string; adminCode: string; point: GeoPoint }>();
  const lookup = cityCentreLookup({
    cityPoint: async (name) => {
      searched.push(name);
      return name === "丽江市" ? { status: "found", city: { name, adminCode: "156530700", point: centre } } : { status: "failure", reason: "refused" };
    },
    cityMemory: { get: (name) => remembered.get(name) ?? null, set: (name, value) => { remembered.set(name, value); } },
  }, stop);
  assert.deepEqual(await lookup("丽江市"), centre);
  assert.deepEqual(await lookup("丽江市"), centre);
  assert.equal(await lookup("大理白族自治州"), null);
  assert.equal(stop.stopped, true);
  assert.equal(await lookup("迪庆藏族自治州"), null);
  assert.deepEqual(searched, ["丽江市", "大理白族自治州"]);
});
