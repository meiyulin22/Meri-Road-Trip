import assert from "node:assert/strict";
import test from "node:test";

import { handleDestinationRecommendationSelectionPost } from "@/app/api/trips/[id]/destination-recommendation-selection/route";
import type { TripMessage } from "@/domain/trip-message/trip-message";
import { applyTripStatePatch, type TripState } from "@/domain/trip-state/trip-state";
import { destinationPreferenceId } from "@/domain/trip-message/destination-choice-identity";
import { verifyDestinationChoice } from "./verified-destination-choice";

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
      persistFollowUp: async ({ messageId, content }) => ({ id: messageId, tripId, role: "assistant",
        content, createdAt: "2026-09-30T00:00:00.000Z" }),
    });
  assert.equal(response.status, 200);
  assert.equal(verifications, 1);
  assert.deepEqual(state.destination.state === "known" && state.destination.areas.at(-1), {
    province: "云南省", places: [{ name: "迪庆藏族自治州", spots: ["梅里雪山"] }],
  });
});
