import assert from "node:assert/strict";
import test from "node:test";

import type { PlanDay } from "@/domain/plan/plan-draft";
import type { SpotCard } from "@/domain/plan/spot-card";
import type { DriveRoute, LonLat } from "@/platform/tianditu/tianditu-drive";

import { planDriveLegs } from "./drive-legs";

function card(id: string, point: LonLat | null): SpotCard {
  return { id, province: "云南省", city: "大理白族自治州", name: id, requested: false, location: null, opening: null, reservation: null,
    setting: null, walking: null, suggestedDuration: null,
    mapCheck: point ? { status: "located", district: "大理市", point } : { status: "not_located" } };
}

const day = (number: number, ids: string[]): PlanDay => ({ day: number, date: null, province: "云南省", city: "大理白族自治州",
  arrivingFrom: null, focus: null, theme: null, stops: ids.map((spotId) => ({ spotId, slot: "morning" as const, anchor: null })) });

const route = (seconds: number): DriveRoute => ({ distanceKm: 4.76, durationSeconds: seconds, path: [[100.1, 25.7], [100.2, 25.6]] });
const key = (from: LonLat, to: LonLat) => `${from.longitude}>${to.longitude}`;

test("neighbouring located stops get a leg; an unlocated stop breaks the chain", async () => {
  const cards = new Map([card("三塔", { longitude: 1, latitude: 0 }), card("古城", { longitude: 2, latitude: 0 }),
    card("苍山", null), card("洱海", { longitude: 3, latitude: 0 })].map((spot) => [spot.id, spot]));
  const asked: string[] = [];
  const outcome = await planDriveLegs([day(1, ["三塔", "古城", "苍山", "洱海"])], cards, {
    drive: async (from, to) => {
      asked.push(key(from, to));
      return { status: "success", route: route(448) };
    },
    memory: { get: () => null, set: () => {} },
    key,
  });
  assert.deepEqual(asked, ["1>2"]);
  assert.deepEqual(outcome.legs.map(({ fromSpotId, toSpotId, durationMinutes, distanceKm }) => [fromSpotId, toSpotId, durationMinutes, distanceKm]),
    [["三塔", "古城", 7, 4.8]]);
  assert.equal(outcome.status, "complete");
});

test("legs come from memory first, and the first refusal stops every later lookup", async () => {
  const cards = new Map(["a", "b", "c", "d"].map((id, index) => card(id, { longitude: index, latitude: 0 })).map((spot) => [spot.id, spot]));
  const remembered = new Map([["0>1", route(60)]]);
  const asked: string[] = [];
  const outcome = await planDriveLegs([day(1, ["a", "b", "c"]), day(2, ["c", "d"])], cards, {
    drive: async (from, to) => {
      asked.push(key(from, to));
      return { status: "failure", reason: "refused" };
    },
    memory: { get: (name) => remembered.get(name) ?? null, set: () => {} },
    key,
  });
  // 0>1 remembered, 1>2 refused, 2>3 never asked.
  assert.deepEqual(asked, ["1>2"]);
  assert.deepEqual(outcome.legs.map(({ fromSpotId }) => fromSpotId), ["a"]);
  assert.deepEqual([outcome.status, outcome.lookups], ["stopped", 1]);
});
