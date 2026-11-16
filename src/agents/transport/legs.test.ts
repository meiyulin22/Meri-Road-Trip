import assert from "node:assert/strict";
import test from "node:test";

import type { PlanDay } from "@/domain/plan/plan-draft";
import type { SpotCard } from "@/domain/plan/spot-card";
import type { DriveRoute, LonLat, TravelMode } from "@/platform/tianditu/tianditu-drive";

import { planDriveLegs, travelModeFor } from "./legs";

function card(id: string, point: LonLat | null): SpotCard {
  return { id, province: "云南省", city: "大理白族自治州", name: id, requested: false, location: null, opening: null, reservation: null,
    setting: null, walking: null, suggestedDuration: null,
    mapCheck: point ? { status: "located", district: "大理市", point } : { status: "not_located" } };
}

const day = (number: number, ids: string[]): PlanDay => ({ day: number, date: null, province: "云南省", city: "大理白族自治州",
  arrivingFrom: null, focus: null, theme: null, stops: ids.map((spotId) => ({ spotId, slot: "morning" as const, anchor: null })) });

const route = (km: number, seconds: number, endGap = 0): DriveRoute => ({
  distanceKm: km, durationSeconds: seconds, path: [[100.1, 25.7], [100.2, 25.6]], offRoadStartMeters: 0, offRoadEndMeters: endGap,
});
const key = (from: LonLat, to: LonLat, mode: TravelMode) => `${mode}:${from.longitude}>${to.longitude}`;
// About 1 km and 4.5 km apart at Dali's latitude.
const 三塔 = { longitude: 100.146, latitude: 25.719 };
const 古城近 = { longitude: 100.156, latitude: 25.719 };
const 古城远 = { longitude: 100.191, latitude: 25.719 };

test("close stops are walked and far ones driven, decided by distance (1.2103)", () => {
  assert.equal(travelModeFor(三塔, 古城近), "walk");
  assert.equal(travelModeFor(三塔, 古城远), "drive");
});

test("a walk's minutes come from its distance at walking pace; a drive keeps Tianditu's time", async () => {
  const cards = new Map([card("三塔", 三塔), card("近", 古城近), card("远", 古城远)].map((spot) => [spot.id, spot]));
  const asked: string[] = [];
  const outcome = await planDriveLegs([day(1, ["三塔", "近", "远"])], cards, {
    drive: async (from, to, mode) => {
      asked.push(key(from, to, mode));
      // Tianditu's own walking time is far too quick (261 s for 1.03 km): it is not used.
      return { status: "success", route: mode === "walk" ? route(1.03, 261) : route(3.6, 480, 650) };
    },
    memory: { get: () => null, set: () => {} },
    key,
  });
  assert.deepEqual(asked, ["walk:100.146>100.156", "drive:100.156>100.191"]);
  assert.deepEqual(outcome.legs.map(({ mode, durationMinutes, distanceKm, offRoadEndMeters }) => [mode, durationMinutes, distanceKm, offRoadEndMeters]),
    [["walk", 14, 1, 0], ["drive", 8, 3.6, 650]]);
});

test("no way on the map is said plainly; an unlocated stop breaks the chain", async () => {
  const cards = new Map([card("双廊", 三塔), card("岛", 古城近), card("苍山", null), card("洱海", 古城远)].map((spot) => [spot.id, spot]));
  const outcome = await planDriveLegs([day(1, ["双廊", "岛", "苍山", "洱海"])], cards, {
    drive: async () => ({ status: "failure", reason: "no_route" }),
    memory: { get: () => null, set: () => {} },
    key,
  });
  assert.deepEqual(outcome.legs.map(({ fromSpotId, toSpotId, mode, durationMinutes, path }) => [fromSpotId, toSpotId, mode, durationMinutes, path.length]),
    [["双廊", "岛", "none", 0, 2]]);
  assert.equal(outcome.status, "complete");
});

test("legs come from memory first, and the first refusal stops every later lookup", async () => {
  const points = [0, 1, 2, 3].map((index) => ({ longitude: 100 + index * 0.05, latitude: 25 }));
  const cards = new Map(["a", "b", "c", "d"].map((id, index) => card(id, points[index])).map((spot) => [spot.id, spot]));
  const remembered = new Map([[key(points[0], points[1], "drive"), route(5, 600)]]);
  const asked: string[] = [];
  const outcome = await planDriveLegs([day(1, ["a", "b", "c"]), day(2, ["c", "d"])], cards, {
    drive: async (from, to, mode) => {
      asked.push(key(from, to, mode));
      return { status: "failure", reason: "refused" };
    },
    memory: { get: (name) => remembered.get(name) ?? null, set: () => {} },
    key,
  });
  assert.equal(asked.length, 1);
  assert.deepEqual(outcome.legs.map(({ fromSpotId }) => fromSpotId), ["a"]);
  assert.deepEqual([outcome.status, outcome.lookups], ["stopped", 1]);
});
