import assert from "node:assert/strict";
import test from "node:test";

import type { TransferLeg } from "@/domain/plan/transfer-legs";
import type { CityPoint, CityPointAnswer } from "@/platform/tianditu/tianditu-city-point";
import type { DriveAnswer, DriveRoute } from "@/platform/tianditu/tianditu-drive";

import { maxTransferLookups, planTransfers, type TransferDependencies } from "./transfers";

const centres: Record<string, CityPoint> = {
  上海: { name: "上海市", adminCode: "156310000", point: { longitude: 121.47, latitude: 31.23 } },
  丽江: { name: "丽江市", adminCode: "156530700", point: { longitude: 100.23, latitude: 26.86 } },
  丽江市: { name: "丽江市", adminCode: "156530700", point: { longitude: 100.23, latitude: 26.86 } },
  大理白族自治州: { name: "大理白族自治州", adminCode: "156532900", point: { longitude: 100.27, latitude: 25.61 } },
};
const road = (minutes: number): DriveRoute => ({
  distanceKm: minutes * 1.4, durationSeconds: minutes * 60, path: [[1, 1], [2, 2], [3, 3]], offRoadStartMeters: 0, offRoadEndMeters: 0,
});
const pending = { status: "not_looked_up" } as const;
const leg = (kind: TransferLeg["kind"], day: number, from: string | null, to: string | null): TransferLeg =>
  ({ kind, day, from, to, estimate: pending });
const trip = [leg("outbound", 1, "上海", "丽江市"), leg("between", 3, "丽江市", "大理白族自治州"), leg("return", 4, "大理白族自治州", "上海")];

function deps(overrides: { cityPoint?: (name: string) => CityPointAnswer; drive?: () => DriveAnswer; cities?: Map<string, CityPoint>; roads?: Map<string, DriveRoute> } = {}) {
  const asked: string[] = [];
  const cities = overrides.cities ?? new Map<string, CityPoint>();
  const roads = overrides.roads ?? new Map<string, DriveRoute>();
  const dependencies: TransferDependencies = {
    cityPoint: async (name) => {
      asked.push(`place ${name}`);
      return overrides.cityPoint?.(name) ?? (centres[name] ? { status: "found", city: centres[name] } : { status: "not_found" });
    },
    cityMemory: { get: (name) => cities.get(name) ?? null, set: (name, city) => { cities.set(name, city); } },
    drive: {
      drive: async (from, to) => {
        asked.push(`drive ${from.longitude}>${to.longitude}`);
        return overrides.drive?.() ?? { status: "success", route: road(160) };
      },
      memory: { get: (key) => roads.get(key) ?? null, set: (key, route) => { roads.set(key, route); } },
      key: (from, to, mode) => `${mode}:${from.longitude}>${to.longitude}`,
    },
  };
  return { dependencies, asked, cities, roads };
}

const statuses = (legs: readonly TransferLeg[]) => legs.map(({ kind, estimate }) => [kind, estimate.status]);

test("a rough drive between city centres for every leg; the way home starts from the last city (1.2106)", async () => {
  const { dependencies, asked } = deps();
  const outcome = await planTransfers(trip, dependencies);
  assert.deepEqual(statuses(outcome.legs), [["outbound", "estimated"], ["between", "estimated"], ["return", "estimated"]]);
  // Three centres, each asked once, and three drives: 大理 → 上海 is not 上海 → 丽江 reversed.
  assert.equal(outcome.lookups, 6);
  assert.deepEqual(asked, ["place 上海", "place 丽江市", "drive 121.47>100.23", "place 大理白族自治州", "drive 100.23>100.27", "drive 100.27>121.47"]);
  const [there] = outcome.legs;
  assert.ok(there.estimate.status === "estimated");
  if (there.estimate.status === "estimated") assert.deepEqual([there.estimate.durationMinutes, there.estimate.distanceKm], [160, 224]);
});

test("in a one-city trip the way back is the way there reversed, not asked again", async () => {
  const { dependencies, asked } = deps();
  const outcome = await planTransfers([leg("outbound", 1, "上海", "丽江市"), leg("return", 3, "丽江市", "上海")], dependencies);
  assert.equal(outcome.lookups, 3);
  assert.deepEqual(asked, ["place 上海", "place 丽江市", "drive 121.47>100.23"]);
  const [there, back] = outcome.legs;
  assert.ok(there.estimate.status === "estimated" && back.estimate.status === "estimated");
  if (there.estimate.status === "estimated" && back.estimate.status === "estimated") {
    assert.deepEqual(back.estimate.path, [...there.estimate.path].reverse());
    assert.equal(back.estimate.durationMinutes, there.estimate.durationMinutes);
  }
});

test("remembered centres and drives are not asked again", async () => {
  const first = deps();
  await planTransfers(trip, first.dependencies);
  const again = deps({ cities: first.cities, roads: first.roads });
  const outcome = await planTransfers(trip, again.dependencies);
  assert.deepEqual(again.asked, []);
  assert.equal(outcome.lookups, 0);
  assert.equal(outcome.status, "complete");
});

test("the first failed lookup stops the rest with no retry; the legs left say not looked up", async () => {
  const { dependencies, asked } = deps({ cityPoint: (name) => name === "丽江市" ? { status: "failure", reason: "refused" }
    : centres[name] ? { status: "found", city: centres[name] } : { status: "not_found" } });
  const outcome = await planTransfers(trip, dependencies);
  assert.equal(outcome.status, "stopped");
  assert.deepEqual(statuses(outcome.legs), [["outbound", "not_looked_up"], ["between", "not_looked_up"], ["return", "not_looked_up"]]);
  assert.deepEqual(asked, ["place 上海", "place 丽江市"]);
});

test("a place not on the map, the same city, and no road are said plainly", async () => {
  const abroad = await planTransfers([leg("outbound", 1, "伦敦", "丽江市")], deps().dependencies);
  assert.deepEqual(abroad.legs[0].estimate, { status: "not_found", place: "伦敦" });
  const home = await planTransfers([leg("outbound", 1, "丽江", "丽江市")], deps().dependencies);
  assert.deepEqual(home.legs[0].estimate, { status: "same_city" });
  const water = await planTransfers([trip[1]], deps({ drive: () => ({ status: "failure", reason: "no_route" }) }).dependencies);
  assert.deepEqual(water.legs[0].estimate, { status: "no_route" });
  assert.equal(water.status, "complete");
});

test("legs that already say why they have no time are kept, and the lookups stay within budget", async () => {
  const missing: TransferLeg = { kind: "outbound", day: 1, from: null, to: "丽江市", estimate: { status: "origin_missing" } };
  const outcome = await planTransfers([missing, trip[1]], deps().dependencies);
  assert.deepEqual(statuses(outcome.legs), [["outbound", "origin_missing"], ["between", "estimated"]]);
  // Thirty changes of city cannot spend more than the budget.
  const many = Array.from({ length: 30 }, (_, index) => leg("between", index + 2, `城${index}`, `城${index + 1}`));
  const capped = await planTransfers(many, deps({ cityPoint: (name) => ({ status: "found",
    city: { name, adminCode: `1565${String(name.length * 1000 + Number(name.slice(1))).padStart(5, "0")}`, point: { longitude: Number(name.slice(1)), latitude: 30 } } }) }).dependencies);
  assert.ok(capped.lookups <= maxTransferLookups);
  assert.ok(capped.legs.some(({ estimate }) => estimate.status === "not_looked_up"));
});
