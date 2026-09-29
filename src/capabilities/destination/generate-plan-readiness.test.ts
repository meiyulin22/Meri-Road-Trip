import assert from "node:assert/strict";
import test from "node:test";

import type { TripState } from "@/domain/trip-state/trip-state";

import { checkGeneratePlanReadiness } from "./generate-plan-readiness";
import type { LocationProvider } from "@/platform/location-provider/location-provider";
import { LocationService } from "./location-service";

const baseState: TripState = {
  name: { state: "known", value: "旅程", source: "user" },
  origin: { state: "missing" },
  destination: { state: "missing" },
  startDate: { state: "missing" },
  endDate: { state: "missing" },
  duration: { state: "missing" },
  transportPreference: { state: "missing" },
};

function state(destination: TripState["destination"]): TripState {
  return { ...baseState, destination };
}

function candidate(providerId: string, region: string) {
  return {
    providerId, name: "香格里拉", province: "云南省", city: "迪庆藏族自治州", district: "香格里拉市", region, address: null,
    longitude: 99.1, latitude: 28.2, coordinateSystem: "GCJ-02" as const,
  };
}

test("missing destination blocks the provider", async () => {
  let calls = 0;
  const service = new LocationService({
    async searchByKeyword() {
      calls += 1;
      return { status: "success", candidates: [] };
    },
  });
  assert.deepEqual(await checkGeneratePlanReadiness(baseState, service), {
    canProceed: false, reason: "destination_missing",
  });
  assert.equal(calls, 0);
});

test("selected destination passes without provider lookup or TripState mutation", async () => {
  let calls = 0;
  const service = new LocationService({
    async searchByKeyword() {
      calls += 1;
      return { status: "success", candidates: [] };
    },
  });
  const tripState = state({
    state: "known", value: "香格里拉", source: "user",
    selection: { provider: "amap", region: "云南省迪庆藏族自治州" },
  });
  const before = structuredClone(tripState);
  assert.deepEqual(await checkGeneratePlanReadiness(tripState, service), {
    canProceed: true, destination: "selected",
  });
  assert.deepEqual(tripState, before);
  assert.equal(calls, 0);
});

for (const [name, candidates, expected] of [
  ["resolved", [candidate("1", "云南省")], { canProceed: true, destination: "resolved" }],
  ["ambiguous", [candidate("1", "云南省"), candidate("2", "四川省")], { canProceed: false, reason: "destination_ambiguous" }],
  ["unresolved", [], { canProceed: false, reason: "destination_unresolved" }],
] as const) {
  test(`${name} destination maps the existing resolution result`, async () => {
    const queries: string[] = [];
    const service = new LocationService({
      async searchByKeyword(query) {
        queries.push(query);
        return { status: "success", candidates };
      },
    });
    const tripState = state({ state: "known", value: "香格里拉", source: "user" });
    const before = structuredClone(tripState);
    assert.deepEqual(await checkGeneratePlanReadiness(tripState, service), expected);
    assert.deepEqual(queries, ["香格里拉"]);
    assert.deepEqual(tripState, before);
  });
}

test("places picked from Meri's own recommendations settle the destination without a lookup", async () => {
  let calls = 0;
  const service = new LocationService({
    async searchByKeyword() { calls += 1; return { status: "success", candidates: [] }; },
  });
  // 「四川省 稻城、四姑娘山」 is not a name any provider holds, and it does not need to be.
  const tripState = state({ state: "known", value: "四川省 稻城亚丁、四姑娘山", source: "user",
    areas: [{ province: "四川省", places: ["稻城亚丁", "四姑娘山"] }] });
  const before = structuredClone(tripState);
  assert.deepEqual(await checkGeneratePlanReadiness(tripState, service), {
    canProceed: true, destination: "selected",
  });
  assert.equal(calls, 0);
  assert.deepEqual(tripState, before);
});

test("a province with no place inside it is too large to plan from, and asks rather than looks up", async () => {
  let calls = 0;
  const service = new LocationService({
    async searchByKeyword() { calls += 1; return { status: "success", candidates: [] }; },
  });
  assert.deepEqual(await checkGeneratePlanReadiness(state({ state: "approximate", value: "海南省",
    source: "user", areas: [{ province: "海南省", places: [] }] }), service), {
    canProceed: false, reason: "destination_area_only",
  });
  assert.equal(calls, 0);
});

test("provider failure is retryable, not invalid TripState", async () => {
  const provider: LocationProvider = {
    async searchByKeyword() { return { status: "failure", reason: "http_error" }; },
  };
  const tripState = state({ state: "known", value: "香格里拉", source: "user" });
  assert.deepEqual(await checkGeneratePlanReadiness(tripState, new LocationService(provider)), {
    canProceed: false, reason: "provider_error",
  });
});

test("not_ready from LocationService follows its domain reason", async () => {
  assert.deepEqual(await checkGeneratePlanReadiness(
    state({ state: "known", value: "香格里拉", source: "user" }),
    { async resolve() { return { status: "not_ready", reason: "destination_missing" }; } },
  ), { canProceed: false, reason: "destination_missing" });
});
