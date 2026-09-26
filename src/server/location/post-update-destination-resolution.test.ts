import assert from "node:assert/strict";
import test from "node:test";

import type { LocationCandidate } from "@/domain/location/location";
import { applyTripStatePatch, type TripState, type TripStatePatch } from "@/domain/trip-state/trip-state";
import type { WorkspaceConversationInterpretation } from "@/domain/trip-state/workspace-conversation";

import { LocationService, type LocationProvider } from "./location-service";
import { persistWorkspacePatchWithDestinationValidation, replyAfterDestinationResolution } from "./post-update-destination-resolution";

const original: TripState = {
  name: { state: "known", value: "旅行", source: "user" },
  origin: { state: "missing" },
  destination: { state: "known", value: "东京", source: "user" },
  startDate: { state: "missing" },
  endDate: { state: "missing" },
  duration: { state: "missing" },
  transportPreference: { state: "missing" },
};
const city: LocationCandidate = {
  providerId: "jilin-city", name: "吉林市", region: "吉林省", address: null,
  longitude: 126.55, latitude: 43.84, coordinateSystem: "GCJ-02",
};
const province: LocationCandidate = {
  providerId: "jilin-province", name: "吉林", region: "中国东北", address: null,
  longitude: 125.32, latitude: 43.89, coordinateSystem: "GCJ-02",
};
const interpretation: WorkspaceConversationInterpretation = {
  intent: "trip_state_update",
  changes: [
    { field: "destination", state: "known", value: "吉林" },
    { field: "duration", state: "known", value: "5天" },
  ],
  reply: "好的，已更新目的地。",
};
const patch: TripStatePatch = {
  destination: { state: "known", value: "吉林", source: "user" },
  duration: { state: "known", value: "5天", source: "user" },
};

test("resolved destination is validated once before the single persistence write", async () => {
  let stored = original;
  let writes = 0;
  let searches = 0;
  const provider: LocationProvider = {
    async searchByKeyword(query) {
      assert.equal(writes, 0);
      assert.deepEqual(stored, original);
      assert.equal(query, "吉林");
      searches += 1;
      return { status: "success", candidates: [city] };
    },
  };
  const result = await persistWorkspacePatchWithDestinationValidation(original, patch, async (committedPatch) => {
    writes += 1;
    stored = applyTripStatePatch(stored, committedPatch);
    return stored;
  }, new LocationService(provider));

  assert.equal(searches, 1);
  assert.equal(writes, 1);
  assert.deepEqual(result.persistedPatch, patch);
  assert.deepEqual(result.tripState.destination, patch.destination);
  assert.equal(result.tripState.destination.state === "known" && "selection" in result.tripState.destination, false);
  assert.deepEqual(result.tripState.duration, patch.duration);
  assert.match(replyAfterDestinationResolution(interpretation, result.tripState, result.resolution, result.persistedPatch), /已将目的地记为/);
});

for (const { status, candidates, replyPattern } of [
  { status: "ambiguous", candidates: [city, province], replyPattern: /请从下方选一个/ },
  { status: "unresolved", candidates: [], replyPattern: /无法识别/ },
] as const) {
  test(`${status} preserves the prior destination while persisting other fields`, async () => {
    let stored = original;
    let writes = 0;
    const provider: LocationProvider = {
      async searchByKeyword() { return { status: "success", candidates }; },
    };
    const result = await persistWorkspacePatchWithDestinationValidation(original, patch, async (committedPatch) => {
      writes += 1;
      assert.equal(committedPatch.destination, undefined);
      stored = applyTripStatePatch(stored, committedPatch);
      return stored;
    }, new LocationService(provider));
    assert.equal(result.resolution?.status, status);
    assert.equal(writes, 1);
    assert.deepEqual(stored.destination, original.destination);
    assert.deepEqual(stored.duration, patch.duration);
    const reply = replyAfterDestinationResolution(interpretation, result.tripState, result.resolution, result.persistedPatch);
    assert.match(reply, replyPattern);
    assert.doesNotMatch(reply, /已将目的地记为|已更新目的地/);
  });
}

test("unresolved destination with no other fields leaves missing destination and performs no write", async () => {
  const missing = { ...original, destination: { state: "missing" as const } };
  const result = await persistWorkspacePatchWithDestinationValidation(missing, { destination: patch.destination },
    async () => { throw new Error("must not persist"); },
    new LocationService({ async searchByKeyword() { return { status: "success", candidates: [] }; } }));
  assert.equal(result.resolution?.status, "unresolved");
  assert.equal(result.persistedPatch, null);
  assert.deepEqual(result.tripState, missing);
});

test("provider failure preserves destination and does not claim the location does not exist", async () => {
  let stored = original;
  const result = await persistWorkspacePatchWithDestinationValidation(original, patch, async (committedPatch) => {
    stored = applyTripStatePatch(stored, committedPatch);
    return stored;
  }, new LocationService({ async searchByKeyword() { return { status: "failure", reason: "http_error" }; } }));
  assert.equal(result.resolution?.status, "provider_error");
  assert.deepEqual(stored.destination, original.destination);
  assert.deepEqual(stored.duration, patch.duration);
  const reply = replyAfterDestinationResolution(interpretation, result.tripState, result.resolution, result.persistedPatch);
  assert.match(reply, /验证暂时不可用/);
  assert.doesNotMatch(reply, /已将目的地记为|无法识别|已更新目的地/);
});

test("unchanged destination and unrelated changes do not resolve", async () => {
  let searches = 0;
  const service = new LocationService({ async searchByKeyword() { searches += 1; return { status: "success", candidates: [city] }; } });
  const persist = async (committedPatch: TripStatePatch) => applyTripStatePatch(original, committedPatch);
  const noPatch = await persistWorkspacePatchWithDestinationValidation(original, null, persist, service);
  const otherField = await persistWorkspacePatchWithDestinationValidation(original,
    { origin: { state: "known", value: "吉林", source: "user" } }, persist, service);
  const sameDestination = await persistWorkspacePatchWithDestinationValidation(original,
    { destination: original.destination }, persist, service);
  assert.equal(searches, 0);
  assert.equal(noPatch.persistedPatch, null);
  assert.equal(otherField.resolution, null);
  assert.equal(sameDestination.persistedPatch, null);
  assert.deepEqual(sameDestination.tripState, original);
});

test("persistence failure occurs after, not before, validation", async () => {
  let searches = 0;
  await assert.rejects(persistWorkspacePatchWithDestinationValidation(original, patch,
    async () => { assert.equal(searches, 1); throw new Error("write failed"); },
    new LocationService({ async searchByKeyword() { searches += 1; return { status: "success", candidates: [city] }; } })),
  /write failed/);
  assert.equal(searches, 1);
});
