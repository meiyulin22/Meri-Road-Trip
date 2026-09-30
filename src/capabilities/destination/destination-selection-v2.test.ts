import assert from "node:assert/strict";
import test from "node:test";

import { handleDestinationRecommendationSelectionPost } from "@/app/api/trips/[id]/destination-recommendation-selection/route";
import type { TripMessage } from "@/domain/trip-message/trip-message";
import { applyTripStatePatch, type TripState } from "@/domain/trip-state/trip-state";

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
      persistFollowUp: async ({ messageId, content }) => ({ id: messageId, tripId, role: "assistant",
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
      persistFollowUp: async () => { throw new Error("must not reply"); },
    });
  assert.equal(response.status, 409);
});
