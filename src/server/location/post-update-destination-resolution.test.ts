import assert from "node:assert/strict";
import test from "node:test";

import type { LocationCandidate } from "@/domain/location/location";
import { applyTripStatePatch, type TripState, type TripStatePatch } from "@/domain/trip-state/trip-state";
import type { WorkspaceConversationInterpretation } from "@/domain/trip-state/workspace-conversation";

import { LocationService, type LocationProvider } from "./location-service";
import {
  persistWorkspacePatchAndResolveDestination,
  replyAfterDestinationResolution,
} from "./post-update-destination-resolution";

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
  changes: [{ field: "destination", state: "known", value: "吉林" }],
  reply: "好的，已更新目的地。",
};

function destinationPatch(): TripStatePatch {
  return { destination: { state: "known", value: "吉林", source: "user" } };
}

test("commits the new destination before one resolve call and uses the persisted value", async () => {
  let stored = original;
  let writes = 0;
  let searches = 0;
  const provider: LocationProvider = {
    async searchByKeyword(query) {
      assert.equal(writes, 1);
      assert.equal(query, "吉林");
      assert.deepEqual(stored.destination, { state: "known", value: "吉林", source: "user" });
      searches += 1;
      return { status: "success", candidates: [city] };
    },
  };

  const { tripState, resolution } = await persistWorkspacePatchAndResolveDestination(
    original,
    destinationPatch(),
    async (patch) => {
      writes += 1;
      stored = applyTripStatePatch(stored, patch);
      return stored;
    },
    new LocationService(provider),
  );

  assert.equal(writes, 1);
  assert.equal(searches, 1);
  assert.deepEqual(tripState, stored);
  assert.deepEqual(stored.destination, { state: "known", value: "吉林", source: "user" });
  assert.equal(resolution?.status, "resolved");
  assert.match(replyAfterDestinationResolution(interpretation, tripState, resolution), /匹配到地点：吉林市（吉林省）/);
});

for (const { name, candidates, expectedStatus, replyPattern } of [
  { name: "ambiguous", candidates: [city, province], expectedStatus: "ambiguous", replyPattern: /你指的是哪一个/ },
  { name: "unresolved", candidates: [], expectedStatus: "unresolved", replyPattern: /无法识别这个地点/ },
] as const) {
  test(`${name} result keeps the destination persisted and produces an appropriate reply`, async () => {
    let stored = original;
    let searches = 0;
    const provider: LocationProvider = {
      async searchByKeyword() {
        searches += 1;
        return { status: "success", candidates };
      },
    };
    const { tripState, resolution } = await persistWorkspacePatchAndResolveDestination(
      original, destinationPatch(), async (patch) => {
        stored = applyTripStatePatch(stored, patch);
        return stored;
      }, new LocationService(provider),
    );

    assert.equal(searches, 1);
    assert.equal(resolution?.status, expectedStatus);
    assert.deepEqual(stored.destination, { state: "known", value: "吉林", source: "user" });
    assert.match(replyAfterDestinationResolution(interpretation, tripState, resolution), replyPattern);
  });
}

test("provider failure keeps the destination and does not call it invalid", async () => {
  let stored = original;
  const provider: LocationProvider = {
    async searchByKeyword() { return { status: "failure", reason: "http_error" }; },
  };
  const { tripState, resolution } = await persistWorkspacePatchAndResolveDestination(
    original, destinationPatch(), async (patch) => {
      stored = applyTripStatePatch(stored, patch);
      return stored;
    }, new LocationService(provider),
  );

  assert.equal(resolution?.status, "provider_error");
  assert.deepEqual(stored.destination, { state: "known", value: "吉林", source: "user" });
  const reply = replyAfterDestinationResolution(interpretation, tripState, resolution);
  assert.match(reply, /查询暂时失败/);
  assert.doesNotMatch(reply, /无法识别这个地点/);
});

test("unchanged destination and unrelated geographic mentions do not resolve", async () => {
  let searches = 0;
  const provider: LocationProvider = {
    async searchByKeyword() {
      searches += 1;
      return { status: "success", candidates: [city] };
    },
  };
  const service = new LocationService(provider);
  const persist = async (patch: TripStatePatch) => applyTripStatePatch(original, patch);

  const unrelatedMention = await persistWorkspacePatchAndResolveDestination(original, null, persist, service);
  const otherField = await persistWorkspacePatchAndResolveDestination(
    original, { origin: { state: "known", value: "吉林", source: "user" } }, persist, service,
  );
  const sameDestination = await persistWorkspacePatchAndResolveDestination(
    original, { destination: original.destination }, persist, service,
  );

  assert.equal(searches, 0);
  assert.equal(unrelatedMention.resolution, null);
  assert.equal(otherField.resolution, null);
  assert.equal(sameDestination.resolution, null);
  assert.equal(unrelatedMention.tripState, original);
  assert.equal(replyAfterDestinationResolution({ intent: "question", changes: [], reply: "这是另一个地方。" }, original, null), "这是另一个地方。");
});

test("persistence failure prevents resolution", async () => {
  let searches = 0;
  const provider: LocationProvider = {
    async searchByKeyword() {
      searches += 1;
      return { status: "success", candidates: [city] };
    },
  };
  await assert.rejects(persistWorkspacePatchAndResolveDestination(
    original, destinationPatch(), async () => { throw new Error("write failed"); }, new LocationService(provider),
  ), /write failed/);
  assert.equal(searches, 0);
});
