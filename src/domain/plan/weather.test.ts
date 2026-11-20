import assert from "node:assert/strict";
import test from "node:test";

import { type DayForecast, forecastWindow, kmBetween, outdoorRating, poorReasons, skyOf, weatherPoints } from "./weather";

const day = (overrides: Partial<DayForecast> = {}): DayForecast => ({
  date: "2026-11-21", code: 1, high: 16, low: 2, precipitationMm: 0, precipitationChance: 0, snowfallCm: 0, gustKmh: 20, ...overrides,
});

test("WMO codes read as the few skies the page draws", () => {
  assert.equal(skyOf(0), "clear");
  assert.equal(skyOf(2), "cloudy");
  assert.equal(skyOf(3), "overcast");
  assert.equal(skyOf(45), "fog");
  assert.equal(skyOf(51), "drizzle");
  assert.equal(skyOf(63), "rain");
  assert.equal(skyOf(81), "rain");
  assert.equal(skyOf(73), "snow");
  assert.equal(skyOf(95), "thunderstorm");
});

test("a day is poor for outdoors on heavy rain, a thunderstorm, heavy snow or a gale (agreed 2026-11-20)", () => {
  // 丽江 2026-11-24 as recorded: thunderstorm, 22.5 mm.
  assert.equal(outdoorRating(day({ code: 95, precipitationMm: 22.5, precipitationChance: 100 })), "poor");
  assert.deepEqual(poorReasons(day({ code: 95, precipitationMm: 22.5 })), ["thunderstorm"]);
  // 玉龙雪山 2026-11-22 as recorded: gusts of 63.7 km/h, Beaufort 8.
  assert.equal(outdoorRating(day({ code: 2, gustKmh: 64 })), "poor");
  assert.deepEqual(poorReasons(day({ gustKmh: 64 })), ["gale"]);
  assert.equal(outdoorRating(day({ code: 63, precipitationMm: 25 })), "poor");
  assert.equal(outdoorRating(day({ code: 65, precipitationMm: 12 })), "poor");
  assert.equal(outdoorRating(day({ code: 73, snowfallCm: 5 })), "poor");
  assert.equal(outdoorRating(day({ gustKmh: 61 })), "good");
});

test("a wet day is fair: shown, never moved", () => {
  assert.equal(outdoorRating(day({ code: 61, precipitationMm: 5 })), "fair");
  assert.equal(outdoorRating(day({ code: 3, precipitationChance: 60 })), "fair");
  assert.equal(outdoorRating(day({ code: 51, precipitationMm: 2.1, precipitationChance: 59 })), "good");
  assert.equal(outdoorRating(day({ precipitationChance: null })), "good");
});

test("the trip's dates split by the forecast's sixteen-day reach; days gone are neither", () => {
  assert.deepEqual(forecastWindow(["2026-11-19", "2026-11-20", "2026-12-05", "2026-12-06"], "2026-11-20"), {
    inside: ["2026-11-20", "2026-12-05"],
    beyond: ["2026-12-06"],
  });
});

test("spots within 2 km share a point; a mountain keeps its own; unlocated spots share the town's point", () => {
  const oldTown = { longitude: 100.2299, latitude: 26.8721 };
  const muFu = { longitude: 100.2330, latitude: 26.8700 };
  const snowMountain = { longitude: 100.1836, latitude: 27.1006 };
  const centre = { longitude: 100.227, latitude: 26.855 };
  assert.ok(kmBetween(oldTown, muFu) < 1);
  const { points, assigned } = weatherPoints([
    { id: "a", point: oldTown }, { id: "b", point: muFu }, { id: "c", point: snowMountain }, { id: "d", point: null },
  ], centre);
  // The unlocated spot shares the town's point, which two located spots share; the centre is not asked.
  assert.deepEqual(points, [oldTown, snowMountain]);
  assert.deepEqual(assigned.get("b"), { index: 0, source: "spot" });
  assert.deepEqual(assigned.get("c"), { index: 1, source: "spot" });
  assert.deepEqual(assigned.get("d"), { index: 0, source: "city" });

  // Nothing located: the city's centre.
  const nothingLocated = weatherPoints([{ id: "d", point: null }], centre);
  assert.deepEqual(nothingLocated.points, [centre]);
  assert.deepEqual(nothingLocated.assigned.get("d"), { index: 0, source: "city" });

  const noCentre = weatherPoints([{ id: "d", point: null }], null);
  assert.deepEqual(noCentre.points, []);
  assert.equal(noCentre.assigned.has("d"), false);
});
