import assert from "node:assert/strict";
import test from "node:test";

import { handleDestinationRecommendationSelectionPost } from "@/app/api/trips/[id]/destination-recommendation-selection/route";
import type { TripMessage } from "@/domain/trip-message/trip-message";
import { applyTripStatePatch, type TripState } from "@/domain/trip-state/trip-state";
import { destinationPreferenceId } from "@/domain/trip-message/destination-choice-identity";
import { verifyDestinationChoice } from "./verified-destination-choice";
import { applyDestinationEdit } from "./apply-destination-edit";
import { validateDestinationEdit } from "@/domain/trip-state/destination-edit";
import { meriReplies } from "@/capabilities/conversation/meri-replies";

const tripId = "trip-a";
const owner = "guest-a";
const initial: TripState = {
  name: { state: "missing" }, origin: { state: "missing" },
  destination: { state: "known", source: "user", areas: [
    { province: "浙江省", places: [{ name: "丽水市", spots: [] }] },
    { province: "福建省", places: [{ name: "宁德市", spots: [] }] },
  ] },
  startDate: { state: "missing" }, endDate: { state: "missing" },
  duration: { state: "missing" }, transportPreference: { state: "missing" },
};

function message(choices: TripMessage["presentation"]): TripMessage {
  return { id: "offer-a", tripId, role: "assistant", content: "选几个城市", presentation: choices,
    createdAt: "2026-09-29T00:00:00.000Z" };
}

test("Meri then an unsupported request then Qingdao preserves Yunnan for both set and add", async () => {
  for (const operation of ["set", "add"] as const) {
    const original: TripState = { ...initial, destination: { state: "known", source: "user", areas: [
      { province: "云南省", places: [{ name: "迪庆藏族自治州", spots: ["梅里雪山"] }] },
    ] } };
    let state = original;
    const unsupported = await applyDestinationEdit(state.destination, { operation: "none" },
      async () => { throw new Error("must not resolve an out-of-scope request"); }, "我想去纽约");
    assert.equal(unsupported.destination, original.destination);
    const edit = validateDestinationEdit({ operation, places: ["青岛"], broadRegion: null });
    const result = await applyDestinationEdit(state.destination, edit, async () => ({
      status: "resolved", pick: { id: "qingdao", province: "山东省", place: "青岛市", spot: null }, exact: false,
    }), "我想去青岛");
    assert.equal(result.destination, original.destination);
    assert.equal(result.choices?.presentation.mode, "add");
    const offered = message(result.choices!.presentation);
    const response = await handleDestinationRecommendationSelectionPost(tripId, owner,
      { messageId: offered.id, destinationIds: result.choices!.presentation.choices.map((choice) => choice.id) }, {
        loadJourney: async () => ({ tripState: state }), listMessages: async () => [offered],
        verifyChoice: async () => ({ status: "verified", pick: { province: "山东省", place: "青岛市", spot: null } }),
        updateTripState: async (_tripId, _owner, patch) => { state = applyTripStatePatch(state, patch); return state; },
        replies: meriReplies.zh, persistFollowUp: async ({ messageId, content }) => ({ id: messageId, tripId, role: "assistant",
          content, createdAt: "2026-10-03T00:00:00.000Z" }),
      });
    assert.equal(response.status, 200);
    assert.deepEqual(state.destination.state === "known" && state.destination.areas,
      [...(original.destination.state === "known" ? original.destination.areas : []),
        { province: "山东省", places: [{ name: "青岛市", spots: [] }] }]);
    const removal = await applyDestinationEdit(state.destination, { operation: "remove", places: ["云南"] },
      async () => { throw new Error("deletion uses the current state, not a provider search"); }, "不去云南了");
    assert.deepEqual(removal.destination, { state: "known", source: "user", areas: [
      { province: "山东省", places: [{ name: "青岛市", spots: [] }] },
    ] });
  }
});

test("an active foreign province card returns 409 without writing state or a confirmation", async () => {
  const offered = message({ type: "destination_choices", mode: "add", choices: [
    { id: "province:安大略省", name: "安大略省", province: "安大略省" },
  ] });
  const response = await handleDestinationRecommendationSelectionPost(tripId, owner,
    { messageId: offered.id, destinationIds: ["province:安大略省"] }, {
      loadJourney: async () => ({ tripState: initial }), listMessages: async () => [offered],
      updateTripState: async () => { throw new Error("must not write"); },
      verifyChoice: (choice) => verifyDestinationChoice(choice, {
        search: async () => { throw new Error("must not search"); },
      }),
      replies: meriReplies.zh, persistFollowUp: async () => { throw new Error("must not confirm"); },
    });
  assert.equal(response.status, 409);
});

test("a second city offer adds Guangdong without replacing Zhejiang and Fujian", async () => {
  let state = initial;
  const offered = message({ type: "destination_choices", mode: "add", choices: [
    { id: "amap-chaozhou", name: "潮州市", province: "广东省", city: "潮州市" },
    { id: "amap-shantou", name: "汕头市", province: "广东省", city: "汕头市" },
  ] });
  const response = await handleDestinationRecommendationSelectionPost(tripId, owner,
    { messageId: offered.id, destinationIds: ["amap-chaozhou", "amap-shantou"] }, {
      loadJourney: async () => ({ tripState: state }), listMessages: async () => [offered],
      updateTripState: async (_tripId, _owner, patch) => { state = applyTripStatePatch(state, patch); return state; },
      verifyChoice: async (choice) => ({ status: "verified", pick: {
        province: choice.province, place: choice.city ?? null, spot: choice.spot ?? null } }),
      replies: meriReplies.zh, persistFollowUp: async ({ messageId, content }) => ({ id: messageId, tripId, role: "assistant",
        content, createdAt: "2026-09-29T00:00:01.000Z" }),
    });
  assert.equal(response.status, 200);
  assert.deepEqual(state.destination.state === "known" && state.destination.areas.map((area) => area.province),
    ["浙江省", "福建省", "广东省"]);
  assert.deepEqual(state.destination.state === "known" && state.destination.areas[2].places.map((place) => place.name),
    ["潮州市", "汕头市"]);
});

test("an old replacement offer cannot overwrite a newer destination", async () => {
  const offered = message({ type: "destination_choices", mode: "replace", baseDestination: JSON.stringify({ state: "missing" }),
    choices: [{ id: "amap-chaozhou", name: "潮州市", province: "广东省", city: "潮州市" }] });
  const response = await handleDestinationRecommendationSelectionPost(tripId, owner,
    { messageId: offered.id, destinationIds: ["amap-chaozhou"] }, {
      loadJourney: async () => ({ tripState: initial }), listMessages: async () => [offered],
      updateTripState: async () => { throw new Error("must not write"); },
      verifyChoice: async () => { throw new Error("must not verify"); },
      replies: meriReplies.zh, persistFollowUp: async () => { throw new Error("must not reply"); },
    });
  assert.equal(response.status, 409);
});

test("a grouped historical spot offer revalidates once and saves one city preference", async () => {
  let state = initial;
  let verifications = 0;
  const offered = message({ type: "destination_choices", mode: "add", choices: ["a", "b", "c"].map((id) => ({
    id, name: "梅里雪山", province: "云南省", city: "迪庆藏族自治州", spot: "梅里雪山",
  })) });
  const response = await handleDestinationRecommendationSelectionPost(tripId, owner,
    { messageId: offered.id, destinationIds: ["a", "b", "c"] }, {
      loadJourney: async () => ({ tripState: state }), listMessages: async () => [offered],
      updateTripState: async (_tripId, _owner, patch) => { state = applyTripStatePatch(state, patch); return state; },
      verifyChoice: async (choice) => {
        verifications += 1;
        assert.equal(choice.id, destinationPreferenceId("云南省", "迪庆藏族自治州", "梅里雪山"));
        return verifyDestinationChoice(choice, { search: async () => ({ status: "success", candidates: [{
          providerId: "fresh-poi", name: "梅里雪山", province: "云南省", city: "迪庆藏族自治州",
          district: "德钦县", address: null, region: "云南省迪庆藏族自治州", longitude: 98.67, latitude: 28.43,
          coordinateSystem: "GCJ-02",
        }] }) });
      },
      replies: meriReplies.zh, persistFollowUp: async ({ messageId, content }) => ({ id: messageId, tripId, role: "assistant",
        content, createdAt: "2026-09-30T00:00:00.000Z" }),
    });
  assert.equal(response.status, 200);
  assert.equal(verifications, 1);
  assert.deepEqual(state.destination.state === "known" && state.destination.areas.at(-1), {
    province: "云南省", places: [{ name: "迪庆藏族自治州", spots: ["梅里雪山"] }],
  });
});
