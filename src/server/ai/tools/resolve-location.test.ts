import assert from "node:assert/strict";
import test from "node:test";

import type { TripState } from "@/domain/trip-state/trip-state";
import { LocationService, type LocationProvider } from "@/server/location/location-service";

import { createResolveLocationTool } from "./resolve-location";

const tripState: TripState = {
  name: { state: "known", value: "旅行", source: "user" },
  origin: { state: "missing" },
  destination: { state: "missing" },
  startDate: { state: "missing" },
  endDate: { state: "missing" },
  duration: { state: "missing" },
  transportPreference: { state: "missing" },
};

test("newly mentioned destination uses LocationService and returns unconfirmed candidates", async () => {
  const queries: string[] = [];
  const provider: LocationProvider = {
    async searchByKeyword(query) {
      queries.push(query);
      return {
        status: "success",
        candidates: [
          { providerId: "city", name: "阿尔山市", region: "内蒙古自治区", address: null, longitude: 119.94, latitude: 47.18, coordinateSystem: "GCJ-02" },
          { providerId: "park", name: "阿尔山国家森林公园", region: "内蒙古自治区", address: null, longitude: 120.42, latitude: 47.28, coordinateSystem: "GCJ-02" },
        ],
      };
    },
  };
  const before = structuredClone(tripState);
  const resolver = createResolveLocationTool({
    tripState,
    currentUserMessage: "我十一想去阿尔山玩几天",
    requestId: "test-location-tool",
    locationService: new LocationService(provider),
  });

  const result = await resolver.execute?.(
    { query: "阿尔山" },
    { toolCallId: "call_1", messages: [] },
  );

  assert.deepEqual(queries, ["阿尔山"]);
  assert.ok(result && "status" in result);
  assert.equal(result.status, "candidates");
  if (result.status === "candidates") {
    assert.deepEqual(result.candidates.map((candidate) => candidate.name), ["阿尔山市", "阿尔山国家森林公园"]);
    assert.equal(result.candidates.some((candidate) => "confirmed" in candidate), false);
  }
  assert.deepEqual(tripState, before);
});

test("a query absent from current message and TripState cannot invoke the provider", async () => {
  let calls = 0;
  const provider: LocationProvider = {
    async searchByKeyword() {
      calls += 1;
      return { status: "success", candidates: [] };
    },
  };
  const resolver = createResolveLocationTool({
    tripState,
    currentUserMessage: "我还没想好去哪",
    requestId: "test-location-tool-blocked",
    locationService: new LocationService(provider),
  });

  assert.deepEqual(
    await resolver.execute?.({ query: "阿尔山" }, { toolCallId: "call_1", messages: [] }),
    { status: "not_ready" },
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
    currentUserMessage: "阿尔山吧",
    requestId: "test-location-tool-failed",
    locationService: new LocationService(provider),
  });

  const result = await resolver.execute?.({ query: "阿尔山" }, { toolCallId: "call_1", messages: [] });
  assert.deepEqual(result, { status: "provider_error" });
  assert.equal(JSON.stringify(result).includes("AMAP_API_KEY"), false);
});
