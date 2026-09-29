import assert from "node:assert/strict";
import test from "node:test";

import type { LocationCandidate } from "@/domain/location/location";
import { applyTripStatePatch, validateTripState, type TripState, type TripStatePatch } from "@/domain/trip-state/trip-state";
import type { WorkspaceConversationInterpretation } from "@/domain/trip-state/workspace-conversation";

import { planReadyNote } from "@/capabilities/conversation/turn-reply";
import type { LocationProvider } from "@/platform/location-provider/location-provider";
import { LocationService } from "./location-service";
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
  providerId: "jilin-city", name: "吉林市", province: "吉林省", city: "吉林市", district: null,
  region: "吉林省", address: null,
  longitude: 126.55, latitude: 43.84, coordinateSystem: "GCJ-02",
};
const province: LocationCandidate = {
  providerId: "jilin-province", name: "吉林", province: null, city: null, district: null,
  region: "中国东北", address: null,
  longitude: 125.32, latitude: 43.89, coordinateSystem: "GCJ-02",
};
const interpretation: WorkspaceConversationInterpretation = {
  intent: "trip_state_update", presentationIntent: "none",
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
  const reply = replyAfterDestinationResolution(interpretation, result.tripState, result.resolution, result.persistedPatch);
  assert.equal(reply, `${interpretation.reply}${planReadyNote}。`);
  assert.doesNotMatch(reply, /匹配到地点|吉林省|jilin-city|坐标/);
});

test("a confirmed destination keeps the model's reply and adds the one sentence only the application can say", () => {
  const resolution = { status: "resolved" as const, candidate: city };
  const destination = { state: "known" as const, value: "吉林", source: "user" as const };
  const noDetails = { ...original, destination, duration: { state: "missing" as const } };
  const durationKnown = { ...noDetails, duration: { state: "known" as const, value: "5天", source: "user" as const } };
  const datesKnown = { ...noDetails, startDate: { state: "known" as const, value: "十月", source: "user" as const } };
  const allKnown = { ...durationKnown, startDate: datesKnown.startDate };

  // The model wrote its reply assuming the destination would land, and it did, so
  // there is nothing to correct and no reason to replace its wording. Readiness is
  // the one thing it may not say — the prompt forbids it — so the application adds
  // that sentence after the model's, whatever details are still missing.
  for (const state of [noDetails, durationKnown, datesKnown, allKnown]) {
    const reply = replyAfterDestinationResolution(interpretation, state, resolution, { destination });
    assert.equal(reply, `${interpretation.reply}${planReadyNote}。`);
    assert.ok(reply.startsWith(interpretation.reply));
  }
});

test("a resolved destination that did not settle says so instead of claiming it landed", () => {
  const unsettled: TripState = { ...original,
    destination: { state: "approximate", value: "吉林附近", source: "user" } };
  const reply = replyAfterDestinationResolution(interpretation, unsettled,
    { status: "resolved", candidate: city }, null);
  assert.match(reply, /目的地还没有明确下来/);
  assert.doesNotMatch(reply, /已更新目的地/);
  assert.ok(!reply.includes(planReadyNote));
});

test("approximate details are not called known or asked for again", () => {
  const state: TripState = { ...original,
    destination: { state: "known", value: "吉林", source: "user" },
    startDate: { state: "approximate", value: "十月左右", source: "user" },
    duration: { state: "approximate", value: "四五天", source: "user" },
  };
  const reply = replyAfterDestinationResolution(interpretation, state,
    { status: "resolved", candidate: city }, { destination: state.destination });
  assert.doesNotMatch(reply, /时间和行程时长也已经记下|什么时候|玩几天/);
  const approximateDestination: TripState = { ...state,
    destination: { state: "approximate", value: "吉林附近", source: "user" } };
  const tentative = replyAfterDestinationResolution(interpretation, approximateDestination,
    { status: "resolved", candidate: city }, { destination: approximateDestination.destination });
  assert.doesNotMatch(tentative, /目的地记下了：|匹配到地点|吉林省/);
});

for (const { status, candidates, replyPattern } of [
  { status: "ambiguous", candidates: [city, province], replyPattern: /你想去下面哪一个/ },
  { status: "unresolved", candidates: [], replyPattern: /还没能确认这个地点/ },
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
    assert.doesNotMatch(reply, /目的地记下了：|已更新目的地|匹配到地点/);
    // Only a destination that actually landed makes a plan possible, so only that
    // one gets the readiness sentence.
    assert.ok(!reply.includes(planReadyNote));
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
  assert.match(reply, /地点查询暂时不可用/);
  assert.match(reply, /稍后可以再试一次/);
  assert.doesNotMatch(reply, /目的地记下了：|无法识别|已更新目的地/);
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

test("a region the user named is saved as an area instead of being thrown away", async () => {
  // 「我想去海南」 used to come back as 「暂时无法验证」 with nothing saved at all, which
  // dropped the one thing the user had told us.
  const hainan: LocationCandidate = {
    providerId: "hainan", name: "海南省", province: "海南省", city: null, district: null,
    region: "海南省", address: null, longitude: 110.33, latitude: 20.03, coordinateSystem: "GCJ-02",
  };
  let stored = original;
  const result = await persistWorkspacePatchWithDestinationValidation(original,
    { destination: { state: "known", value: "海南", source: "user" }, duration: patch.duration },
    async (committedPatch) => { stored = applyTripStatePatch(stored, committedPatch); return stored; },
    new LocationService({ async searchByKeyword() { return { status: "success", candidates: [hainan] }; } }));

  assert.equal(result.resolution?.status, "area");
  assert.deepEqual(stored.destination, {
    state: "approximate", value: "海南省", source: "user", areas: [{ province: "海南省", places: [] }],
  });
  assert.deepEqual(stored.duration, patch.duration);
  // The Journey has to keep opening, so the stored shape goes through the validator.
  assert.deepEqual(validateTripState(JSON.parse(JSON.stringify(stored))), stored);
  // The model's reply assumed the region landed, and it did.
  assert.equal(replyAfterDestinationResolution(interpretation, result.tripState, result.resolution,
    result.persistedPatch), interpretation.reply);
});
