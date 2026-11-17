import assert from "node:assert/strict";
import test from "node:test";

import { fiveDays, handoff as handoffFor } from "@/agents/planner/plan-test-fixtures";
import type { TransferDependencies } from "@/agents/transport/transfers";
import type { ReadyPlan } from "@/domain/plan/plan-draft-response";
import type { TransferLeg } from "@/domain/plan/transfer-legs";
import { applyTripStatePatch, type TripState } from "@/domain/trip-state/trip-state";
import { InMemoryPlanRunRepository } from "@/platform/persistence/in-memory/in-memory-plan-run-repository";

import { fillGettingThere, type GettingThereRequest, handleGettingTherePost } from "./getting-there";
import { canonicalJson, handoffKey } from "./plan-run-service";

const tripId = "3d17d2c7-fd9b-4748-b751-3a76a9a920be";
const runId = "00000000-0000-4000-8000-000000000001";
const versionId = "00000000-0000-4000-8000-000000000002";
const owner = "85cbd49a-25fa-4942-aa49-4d01cf63023f";
// A saved trip has its name: the first write to TripState gives it one.
const base = handoffFor(["丽江市", "大理白族自治州"], fiveDays);
const handoff = { ...base, tripState: { ...base.tripState, name: { state: "known" as const, value: "云南之旅", source: "system" as const } } };
const frame = (day: number, city: string, arrivingFrom: string | null = null) =>
  ({ day, date: null, province: "云南省", city, arrivingFrom, focus: null, theme: null, stops: [] });
const between: TransferLeg = { kind: "between", day: 4, from: "丽江市", to: "大理白族自治州",
  estimate: { status: "estimated", distanceKm: 186, durationMinutes: 163, path: [[100.2, 26.9], [100.3, 25.6]] } };
const plan: ReadyPlan = {
  status: "ready",
  draft: {
    mode: "full", totalDays: 5, route: { source: "agent", cities: [], omitted: [] },
    days: [frame(1, "丽江市"), frame(2, "丽江市"), frame(3, "丽江市"), frame(4, "大理白族自治州", "丽江市"), frame(5, "大理白族自治州")],
    conflicts: [], unverified: [],
    transfers: [
      { kind: "outbound", day: 1, from: null, to: "丽江市", estimate: { status: "origin_missing" } },
      between,
      { kind: "return", day: 5, from: "大理白族自治州", to: null, estimate: { status: "origin_missing" } },
    ],
  },
  spots: [], cities: [], pendingProvinces: [], dayPhotos: [], mapCheck: "complete",
};
const shanghai: GettingThereRequest = {
  origin: { name: "上海虹桥站", region: "上海市闵行区", coordinates: { longitude: 121.32, latitude: 31.19, coordinateSystem: "CGCS2000" } },
  choice: "train",
};

function setup(current: TripState = handoff.tripState) {
  const repository = new InMemoryPlanRunRepository();
  repository.runs.set(runId, {
    id: runId, tripId, status: "succeeded", handoff, handoffKey: handoffKey(handoff),
    errorCode: null, usage: null, startedAt: "2026-11-17T08:00:00.000Z", finishedAt: "2026-11-17T08:01:00.000Z", durationMs: 60_000,
  });
  repository.versions.push({ id: versionId, tripId, runId, version: 1, tripState: handoff.tripState, preferences: [], plan, createdAt: "2026-11-17T08:01:00.000Z" });
  let state = current;
  const writes: string[] = [];
  const asked: string[] = [];
  const transfers: TransferDependencies = {
    cityPoint: async (name) => {
      asked.push(`place ${name}`);
      return { status: "found", city: { name, adminCode: name.startsWith("丽江") ? "156530700" : "156532900",
        point: name.startsWith("丽江") ? { longitude: 100.2, latitude: 26.9 } : { longitude: 100.3, latitude: 25.6 } } };
    },
    cityMemory: { get: () => null, set: () => {} },
    drive: {
      drive: async (from, to) => {
        asked.push(`drive ${from.longitude}>${to.longitude}`);
        return { status: "success", route: { distanceKm: 2700, durationSeconds: 136_800, path: [[from.longitude, from.latitude], [to.longitude, to.latitude]], offRoadStartMeters: 0, offRoadEndMeters: 0 } };
      },
      memory: { get: () => null, set: () => {} },
      key: (from, to, mode) => `${mode}:${from.longitude}>${to.longitude}`,
    },
  };
  const deps = {
    loadJourney: async () => ({ tripState: state }),
    updateTripState: async (_trip: string, _owner: string, patch: Parameters<typeof applyTripStatePatch>[1]) => {
      writes.push(Object.keys(patch).join(","));
      state = applyTripStatePatch(state, patch);
      return state;
    },
    repository,
    transfers,
  };
  return { deps, repository, writes, asked, current: () => state };
}

test("the origin is filled in once: TripState, then the plan version, then the run's handoff, and only setting off and home are estimated (1.2107)", async () => {
  const { deps, repository, writes, asked, current } = setup();
  const outcome = await fillGettingThere(tripId, owner, shanghai, deps);
  assert.equal(outcome.status, "filled");
  // Origin with its picked point, and train as public transport.
  assert.deepEqual(writes, ["origin,transportPreference"]);
  const origin = current().origin;
  assert.equal(origin.state === "known" && origin.value, "上海虹桥站");
  assert.deepEqual(current().transportPreference, { state: "known", value: "public_transport", source: "user" });
  // The picked point is used as it is: no search for 上海, one drive there and one back; 丽江→大理 kept.
  assert.deepEqual(asked, ["place 丽江市", "drive 121.32>100.2", "place 大理白族自治州", "drive 100.3>121.32"]);
  const version = repository.versions[0];
  assert.deepEqual(version.plan.draft.transfers?.map(({ kind, estimate }) => [kind, estimate.status]),
    [["outbound", "estimated"], ["between", "estimated"], ["return", "estimated"]]);
  assert.deepEqual(version.plan.draft.transfers?.[1], between);
  assert.equal(version.plan.travelChoice, "train");
  // The version and the run now match TripState, so the plan is current and the page finds it again.
  assert.equal(canonicalJson(version.tripState), canonicalJson(current()));
  const run = repository.runs.get(runId);
  assert.equal(canonicalJson(run?.handoff.tripState), canonicalJson(current()));
  assert.equal(run?.handoffKey, handoffKey({ ...handoff, tripState: current() }));
  assert.ok(outcome.status === "filled" && outcome.handoff.tripState === current());
});

test("filled once: a second origin is refused; the same one again finishes a half-done fill without writing TripState", async () => {
  const first = setup();
  await fillGettingThere(tripId, owner, shanghai, first.deps);
  assert.equal((await fillGettingThere(tripId, owner, shanghai, first.deps)).status, "already_filled");

  // TripState was written but the version was not: the same request completes it.
  const written = applyTripStatePatch(handoff.tripState, {
    origin: { state: "known", value: "上海虹桥站", source: "user",
      selection: { provider: "tianditu", region: "上海市闵行区", coordinates: shanghai.origin.coordinates } },
    transportPreference: { state: "known", value: "public_transport", source: "user" },
  });
  const half = setup(written);
  assert.equal((await fillGettingThere(tripId, owner, shanghai, half.deps)).status, "filled");
  assert.deepEqual(half.writes, []);
  const other = setup(written);
  const beijing = { ...shanghai, origin: { ...shanghai.origin, name: "北京" } };
  assert.equal((await fillGettingThere(tripId, owner, beijing, other.deps)).status, "already_filled");
});

test("a plan made from an older trip, or no finished plan, is not filled in", async () => {
  const changed = setup({ ...handoff.tripState, startDate: { state: "known", value: "2026-12-21", source: "user" } });
  assert.equal((await fillGettingThere(tripId, owner, shanghai, changed.deps)).status, "plan_stale");
  const empty = setup();
  empty.repository.versions.length = 0;
  assert.equal((await fillGettingThere(tripId, owner, shanghai, empty.deps)).status, "no_plan");
});

test("a choice is ignored when the trip already said how to travel", async () => {
  const known = { ...handoff.tripState, transportPreference: { state: "known" as const, value: "self_drive" as const, source: "user" as const } };
  const { deps, repository, writes } = setup(known);
  repository.versions[0] = { ...repository.versions[0], tripState: known };
  const outcome = await fillGettingThere(tripId, owner, shanghai, deps);
  assert.equal(outcome.status, "filled");
  assert.deepEqual(writes, ["origin"]);
  assert.equal(repository.versions[0].plan.travelChoice, undefined);
});

test("the endpoint answers a bad request, a missing guest and a refusal plainly", async () => {
  const { deps } = setup();
  const never = () => false;
  assert.equal((await handleGettingTherePost(tripId, null, shanghai, deps, never)).status, 404);
  const bad = await handleGettingTherePost(tripId, owner, { origin: { name: "上海" }, choice: null }, deps, never);
  assert.equal(bad.status, 400);
  // A point outside China is not a suggestion this page offers.
  const abroad = { ...shanghai, origin: { ...shanghai.origin, coordinates: { longitude: -0.12, latitude: 51.5, coordinateSystem: "CGCS2000" } } };
  assert.equal((await handleGettingTherePost(tripId, owner, abroad, deps, never)).status, 400);
  const ok = await handleGettingTherePost(tripId, owner, shanghai, deps, never);
  assert.equal(ok.status, 200);
  const again = await handleGettingTherePost(tripId, owner, shanghai, deps, never);
  assert.equal(again.status, 409);
  assert.equal(((await again.json()) as { error: { code: string } }).error.code, "already_filled");
});
