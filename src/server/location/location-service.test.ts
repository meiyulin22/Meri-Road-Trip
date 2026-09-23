import assert from "node:assert/strict";
import test from "node:test";

import type { TripState, TripStateField } from "@/domain/trip-state/trip-state";

import { LocationService, type LocationProvider } from "./location-service";

const baseState: TripState = {
  name: { state: "known", value: "旅行", source: "user" },
  origin: { state: "missing" },
  destination: { state: "missing" },
  startDate: { state: "missing" },
  endDate: { state: "missing" },
  duration: { state: "missing" },
  transportPreference: { state: "missing" },
};

test("missing destination blocks Location Resolve without calling the provider", async () => {
  let calls = 0;
  const provider: LocationProvider = {
    async searchByKeyword() {
      calls += 1;
      return { status: "success", candidates: [] };
    },
  };

  assert.deepEqual(await new LocationService(provider).resolve(baseState), {
    status: "not_ready",
    reason: "destination_missing",
  });
  assert.equal(calls, 0);
});

for (const destination of [
  { state: "known", value: "阿尔山", source: "user" },
  { state: "approximate", value: "阿尔山附近", source: "user" },
  { state: "ambiguous", value: "阿尔山或西湖", source: "user" },
] as const satisfies readonly TripStateField[]) {
  test(`${destination.state} destination searches its text without mutating TripState`, async () => {
    const queries: string[] = [];
    const provider: LocationProvider = {
      async searchByKeyword(query) {
        queries.push(query);
        return {
          status: "success",
          candidates: [{
            providerId: "poi-1",
            name: "阿尔山",
            region: "内蒙古自治区 兴安盟 阿尔山市",
            address: null,
            longitude: 119.94,
            latitude: 47.18,
            coordinateSystem: "GCJ-02",
          }],
        };
      },
    };
    const state: TripState = { ...baseState, destination };
    const before = structuredClone(state);

    const result = await new LocationService(provider).resolve(state);

    assert.equal(result.status, "candidates");
    assert.deepEqual(queries, [destination.value]);
    assert.deepEqual(state, before);
  });
}

test("empty provider results are distinct from failure", async () => {
  const state: TripState = {
    ...baseState,
    destination: { state: "known", value: "西湖", source: "user" },
  };
  const provider: LocationProvider = {
    async searchByKeyword() {
      return { status: "success", candidates: [] };
    },
  };

  assert.deepEqual(await new LocationService(provider).resolve(state), {
    status: "no_candidates",
  });
});

test("provider failures are reported without exposing provider details", async () => {
  const state: TripState = {
    ...baseState,
    destination: { state: "known", value: "西湖", source: "user" },
  };
  const provider: LocationProvider = {
    async searchByKeyword() {
      return { status: "failure", reason: "http_error" };
    },
  };

  assert.deepEqual(await new LocationService(provider).resolve(state), {
    status: "provider_error",
  });
});

test("a provisional destination expression can be searched without changing TripState", async () => {
  const queries: string[] = [];
  const provider: LocationProvider = {
    async searchByKeyword(query) {
      queries.push(query);
      return { status: "success", candidates: [] };
    },
  };
  const before = structuredClone(baseState);
  const service = new LocationService(provider);

  assert.deepEqual(await service.resolveExpression("阿尔山"), { status: "no_candidates" });
  assert.deepEqual(await service.resolveExpression("  "), {
    status: "not_ready",
    reason: "destination_missing",
  });
  assert.deepEqual(queries, ["阿尔山"]);
  assert.deepEqual(baseState, before);
});
