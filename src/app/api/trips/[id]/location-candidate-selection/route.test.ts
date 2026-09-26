import assert from "node:assert/strict";
import test from "node:test";

import type { TripMessage } from "@/domain/trip-message/trip-message";
import type { TripState, TripStatePatch } from "@/domain/trip-state/trip-state";
import { applyTripStatePatch } from "@/domain/trip-state/trip-state";
import { TripNotFoundError } from "@/domain/trip/trip-errors";

import { handleLocationCandidateSelectionPost } from "./route";

const tripId = "3d17d2c7-fd9b-4748-b751-3a76a9a920be";
const state: TripState = {
  name: { state: "missing" }, origin: { state: "missing" }, destination: { state: "missing" },
  startDate: { state: "missing" }, endDate: { state: "missing" },
  duration: { state: "missing" }, transportPreference: { state: "missing" },
};
const message: TripMessage = {
  id: "assistant-1", tripId, role: "assistant", content: "请选择具体地点。",
  createdAt: "2026-09-26T00:00:00.000Z",
  presentation: { type: "location_candidates", candidates: [
    { providerId: "poi-a", name: "吉林市", region: "吉林省", address: "市中心", longitude: 126.55, latitude: 43.84, coordinateSystem: "GCJ-02" },
    { providerId: "poi-b", name: "吉林", region: "中国东北", address: null, longitude: 125.32, latitude: 43.89, coordinateSystem: "GCJ-02" },
  ] },
};

test("selection uses only a candidate from the owned persisted assistant presentation", async () => {
  let writes = 0;
  const response = await handleLocationCandidateSelectionPost(tripId, "owner", { messageId: message.id, candidateIndex: 1 }, {
    async loadJourney(id, owner) { assert.equal(id, tripId); assert.equal(owner, "owner"); return { tripState: state }; },
    async listMessages() { return [message]; },
    async updateTripState(id, owner, patch: TripStatePatch) {
      assert.equal(id, tripId);
      assert.equal(owner, "owner");
      writes += 1;
      assert.deepEqual(patch.destination, {
        state: "known", value: "吉林", source: "user",
        selection: { provider: "amap", providerId: "poi-b", region: "中国东北",
          coordinates: { longitude: 125.32, latitude: 43.89, coordinateSystem: "GCJ-02" } },
      });
      return applyTripStatePatch(state, patch);
    },
  });
  assert.equal(response.status, 200);
  assert.equal(writes, 1);
  const body = await response.json();
  assert.equal(body.tripState.destination.value, "吉林");
  assert.equal(body.tripState.destination.selection.providerId, "poi-b");
});

test("missing or wrong owner cannot select a candidate", async () => {
  let writes = 0;
  const deps = {
    async loadJourney() { throw new TripNotFoundError(tripId); },
    async listMessages() { return [message]; },
    async updateTripState() { writes += 1; return state; },
  };
  assert.equal((await handleLocationCandidateSelectionPost(tripId, null, { messageId: message.id, candidateIndex: 0 }, deps)).status, 404);
  assert.equal((await handleLocationCandidateSelectionPost(tripId, "wrong", { messageId: message.id, candidateIndex: 0 }, deps)).status, 404);
  assert.equal(writes, 0);
});

test("tampered candidate, missing message, and invalid index cannot update TripState", async () => {
  let writes = 0;
  const deps = {
    async loadJourney() { return { tripState: state }; },
    async listMessages() { return [message]; },
    async updateTripState() { writes += 1; return state; },
  };
  const attempts = [
    { messageId: message.id, candidateIndex: 0, candidate: { name: "伪造地点" } },
    { messageId: "missing", candidateIndex: 0 },
    { messageId: message.id, candidateIndex: 2 },
    { messageId: message.id, candidateIndex: -1 },
    { messageId: message.id, candidateIndex: 0.5 },
  ];
  for (const body of attempts) {
    assert.notEqual((await handleLocationCandidateSelectionPost(tripId, "owner", body, deps)).status, 200);
  }
  assert.equal(writes, 0);
});
