import assert from "node:assert/strict";
import test from "node:test";

import type { TripState } from "@/domain/trip-state/trip-state";
import { LocationService, type LocationProvider } from "@/server/location/location-service";

import { createResolveLocationTool } from "./resolve-location";

const tripState: TripState = {
  name: { state: "known", value: "旅行", source: "user" },
  origin: { state: "missing" },
  destination: { state: "known", value: "朝阳", source: "user" },
  startDate: { state: "missing" },
  endDate: { state: "missing" },
  duration: { state: "missing" },
  transportPreference: { state: "missing" },
};

test("stored Journey destination returns ambiguous candidates without changing TripState", async () => {
  const queries: string[] = [];
  const provider: LocationProvider = {
    async searchByKeyword(query) {
      queries.push(query);
      return {
        status: "success",
        candidates: [
          { providerId: "city", name: "朝阳市", region: "辽宁省", address: null, longitude: 119.94, latitude: 47.18, coordinateSystem: "GCJ-02" },
          { providerId: "district", name: "朝阳区", region: "北京市", address: null, longitude: 116.4, latitude: 39.9, coordinateSystem: "GCJ-02" },
        ],
      };
    },
  };
  const before = structuredClone(tripState);
  const resolver = createResolveLocationTool({
    tripState,
    requestId: "test-location-tool",
    locationService: new LocationService(provider),
  });

  assert.match(resolver.description ?? "", /current Journey destination stored in TripState/);
  assert.match(resolver.description ?? "", /destination in TripState alone is not a reason/);
  assert.match(resolver.description ?? "", /casual conversation, questions about Meri/);

  const result = await resolver.execute?.(
    { query: "朝阳" },
    { toolCallId: "call_1", messages: [] },
  );

  assert.deepEqual(queries, ["朝阳"]);
  assert.ok(result && "status" in result);
  assert.equal(result.status, "ambiguous");
  if (result.status === "ambiguous") {
    assert.deepEqual(result.candidates.map((candidate) => candidate.name), ["朝阳市", "朝阳区"]);
    assert.equal(result.candidates.some((candidate) => "confirmed" in candidate), false);
  }
  assert.deepEqual(tripState, before);
});

test("unrelated geographic mention cannot replace or resolve the Journey destination", async () => {
  let calls = 0;
  const provider: LocationProvider = {
    async searchByKeyword() {
      calls += 1;
      return { status: "success", candidates: [] };
    },
  };
  const resolver = createResolveLocationTool({
    tripState,
    requestId: "test-location-tool-blocked",
    locationService: new LocationService(provider),
  });

  assert.deepEqual(
    await resolver.execute?.({ query: "阿尔山" }, { toolCallId: "call_1", messages: [] }),
    { status: "not_ready", reason: "destination_missing_or_mismatch" },
  );
  assert.equal(calls, 0);
});

test("missing TripState destination blocks provider access", async () => {
  let calls = 0;
  const provider: LocationProvider = {
    async searchByKeyword() {
      calls += 1;
      return { status: "success", candidates: [] };
    },
  };
  const resolver = createResolveLocationTool({
    tripState: { ...tripState, destination: { state: "missing" } },
    requestId: "test-location-tool-missing",
    locationService: new LocationService(provider),
  });
  assert.deepEqual(
    await resolver.execute?.({ query: "阿尔山" }, { toolCallId: "call_1", messages: [] }),
    { status: "not_ready", reason: "destination_missing_or_mismatch" },
  );
  assert.equal(calls, 0);
});

test("provider failure reaches the model as a safe status", async () => {
  const provider: LocationProvider = {
    async searchByKeyword() {
      return { status: "failure", reason: "api_or_response_error" };
    },
  };
  const resolver = createResolveLocationTool({
    tripState,
    requestId: "test-location-tool-failed",
    locationService: new LocationService(provider),
  });

  const result = await resolver.execute?.({ query: "朝阳" }, { toolCallId: "call_1", messages: [] });
  assert.deepEqual(result, { status: "provider_error" });
  assert.equal(JSON.stringify(result).includes("AMAP_API_KEY"), false);
});
