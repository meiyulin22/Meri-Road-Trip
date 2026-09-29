import assert from "node:assert/strict";
import test from "node:test";

import type { TripMessage } from "@/domain/trip-message/trip-message";
import type { TripState, TripStatePatch } from "@/domain/trip-state/trip-state";
import { applyTripStatePatch } from "@/domain/trip-state/trip-state";
import { TripNotFoundError } from "@/domain/trip/trip-errors";
import { InMemoryTripMessageRepository } from "@/platform/persistence/in-memory/in-memory-trip-message-repository";

import { handleDestinationRecommendationSelectionPost } from "@/app/api/trips/[id]/destination-recommendation-selection/route";

const tripId = "8c2a9f10-6b4d-4f27-9a3e-0d1c5b7e4f82";
const state: TripState = {
  name: { state: "missing" }, origin: { state: "missing" }, destination: { state: "missing" },
  startDate: { state: "missing" }, endDate: { state: "missing" },
  duration: { state: "missing" }, transportPreference: { state: "missing" },
};
const message: TripMessage = {
  id: "assistant-cards", tripId, role: "assistant", content: "你想去哪些都可以选上。",
  createdAt: "2026-09-28T09:00:00.000Z",
  presentation: { type: "destination_recommendations", destinations: [
    { id: "rec-a", name: "舟山市", province: "浙江省", reason: "东海小岛，安静" },
    { id: "rec-b", name: "台州市", province: "浙江省", reason: "海岸线和括苍山" },
    { id: "rec-c", name: "北海市", province: "广西壮族自治区", reason: "火山岛海岸线" },
  ] },
};

function followUp(input: { tripId: string; messageId: string; content: string }): TripMessage {
  return { id: input.messageId, tripId: input.tripId, role: "assistant", content: input.content,
    createdAt: "2026-09-28T09:00:01.000Z" };
}

const readySelected = { canProceed: true, destination: "selected" } as const;

test("only a card Meri offered can be picked, and its stored name is what gets saved", async () => {
  let writes = 0;
  const response = await handleDestinationRecommendationSelectionPost(tripId, "owner",
    { messageId: message.id, destinationIds: ["rec-c"] }, {
      async loadJourney(id, owner) { assert.equal(id, tripId); assert.equal(owner, "owner"); return { tripState: state }; },
      async listMessages() { return [message]; },
      async updateTripState(_id, _owner, patch: TripStatePatch) {
        writes += 1;
        assert.deepEqual(patch.destination, { state: "known", value: "广西壮族自治区 北海市", source: "user",
          areas: [{ province: "广西壮族自治区", places: ["北海市"] }] });
        return applyTripStatePatch(state, patch);
      },
      async checkReadiness() { return readySelected; },
      async persistFollowUp(input) { return followUp(input); },
    });
  assert.equal(response.status, 200);
  assert.equal(writes, 1);
  const body = await response.json();
  assert.equal(body.tripState.destination.value, "广西壮族自治区 北海市");
  assert.match(body.assistantMessage.content, /目的地定为广西壮族自治区 北海市了/u);
  assert.match(body.assistantMessage.content, /现在已经可以开始生成旅行计划/u);
});

test("several picks become one destination, grouped back under the provinces they were offered under", async () => {
  const response = await handleDestinationRecommendationSelectionPost(tripId, "owner",
    { messageId: message.id, destinationIds: ["rec-c", "rec-a", "rec-b"] }, {
      async loadJourney() { return { tripState: state }; },
      async listMessages() { return [message]; },
      async updateTripState(_id, _owner, patch: TripStatePatch) {
        assert.deepEqual(patch.destination, { state: "known",
          value: "广西壮族自治区 北海市 · 浙江省 舟山市、台州市", source: "user",
          areas: [{ province: "广西壮族自治区", places: ["北海市"] },
            { province: "浙江省", places: ["舟山市", "台州市"] }] });
        return applyTripStatePatch(state, patch);
      },
      async checkReadiness() { return readySelected; },
      async persistFollowUp(input) { return followUp(input); },
    });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.tripState.destination.areas,
    [{ province: "广西壮族自治区", places: ["北海市"] }, { province: "浙江省", places: ["舟山市", "台州市"] }]);
});

test("a later Guangdong narrowing choice is appended to the earlier Zhejiang and Fujian choices", async () => {
  const earlier: TripState = { ...state, destination: { state: "known", source: "user",
    value: "浙江省 松阳古村落 · 福建省 龙潭里",
    areas: [{ province: "浙江省", places: ["松阳古村落"] },
      { province: "福建省", places: ["龙潭里"] }] } };
  const offer: TripMessage = { ...message, id: "guangdong-cards", presentation: {
    type: "destination_recommendations", baseAreas: earlier.destination.state === "known"
      ? earlier.destination.areas : undefined,
    destinations: [
      { id: "chaozhou", name: "潮州市", province: "广东省" },
      { id: "shantou", name: "汕头市", province: "广东省" },
      { id: "jieyang", name: "揭阳市", province: "广东省" },
    ] } };
  let current = earlier;
  const dependencies = {
    async loadJourney() { return { tripState: current }; },
    async listMessages() { return [offer]; },
    async updateTripState(_id: string, _owner: string, patch: TripStatePatch) {
      current = applyTripStatePatch(current, patch);
      return current;
    },
    async checkReadiness() { return readySelected; },
    async persistFollowUp(input: Parameters<typeof followUp>[0]) { return followUp(input); },
  };
  const response = await handleDestinationRecommendationSelectionPost(tripId, "owner",
    { messageId: offer.id, destinationIds: ["chaozhou", "shantou"] }, dependencies);
  assert.equal(response.status, 200);
  assert.deepEqual(current.destination.state === "known" ? current.destination.areas : null, [
    { province: "浙江省", places: ["松阳古村落"] },
    { province: "福建省", places: ["龙潭里"] },
    { province: "广东省", places: ["潮州市", "汕头市"] },
  ]);
  const stale = await handleDestinationRecommendationSelectionPost(tripId, "owner",
    { messageId: offer.id, destinationIds: ["jieyang"] }, dependencies);
  assert.equal(stale.status, 409);
});

test("an earlier offer cannot replace a destination already selected", async () => {
  let writes = 0;
  const selected: TripState = { ...state, destination: { state: "known", source: "user",
    value: "浙江省 舟山市", areas: [{ province: "浙江省", places: ["舟山市"] }] } };
  const response = await handleDestinationRecommendationSelectionPost(tripId, "owner",
    { messageId: message.id, destinationIds: ["rec-c"] }, {
      async loadJourney() { return { tripState: selected }; },
      async listMessages() { return [message]; },
      async updateTripState() { writes += 1; return selected; },
      async checkReadiness() { return readySelected; },
      async persistFollowUp(input) { return followUp(input); },
    });
  assert.equal(response.status, 409);
  assert.equal(writes, 0);
});

test("missing or wrong owner cannot pick a recommendation", async () => {
  let writes = 0;
  const dependencies = {
    async loadJourney() { throw new TripNotFoundError(tripId); },
    async listMessages() { return [message]; },
    async updateTripState() { writes += 1; return state; },
    async checkReadiness() { return readySelected; },
    async persistFollowUp(input: Parameters<typeof followUp>[0]) { return followUp(input); },
  };
  const body = { messageId: message.id, destinationIds: ["rec-a"] };
  assert.equal((await handleDestinationRecommendationSelectionPost(tripId, null, body, dependencies)).status, 404);
  assert.equal((await handleDestinationRecommendationSelectionPost(tripId, "wrong", body, dependencies)).status, 404);
  assert.equal(writes, 0);
});

test("a name from the request, an unknown card, a repeated pick, and a candidate message cannot update TripState", async () => {
  let writes = 0;
  const dependencies = {
    async loadJourney() { return { tripState: state }; },
    async listMessages() { return [message, { ...message, id: "assistant-candidates",
      presentation: { type: "location_candidates" as const, candidates: [
        { providerId: "poi-a", name: "汕头市", province: "广东省", city: "汕头市", district: null,
          region: "广东", address: null,
          longitude: 116.68, latitude: 23.35, coordinateSystem: "GCJ-02" as const },
      ] } }]; },
    async updateTripState() { writes += 1; return state; },
    async checkReadiness() { return readySelected; },
    async persistFollowUp(input: Parameters<typeof followUp>[0]) { return followUp(input); },
  };
  const attempts = [
    { messageId: message.id, destinationIds: ["rec-a"], name: "伪造地点" },
    { messageId: message.id, destinationIds: ["rec-z"] },
    { messageId: message.id, destinationIds: ["rec-a", "rec-z"] },
    { messageId: message.id, destinationIds: ["rec-a", "rec-a"] },
    { messageId: message.id, destinationIds: [] },
    { messageId: message.id, destinationIds: "rec-a" },
    { messageId: "missing", destinationIds: ["rec-a"] },
    { messageId: "assistant-candidates", destinationIds: ["rec-a"] },
    { messageId: message.id, destinationIds: [""] },
  ];
  for (const body of attempts) {
    assert.notEqual((await handleDestinationRecommendationSelectionPost(tripId, "owner", body, dependencies)).status, 200);
  }
  assert.equal(writes, 0);
});

test("a card offered before places carried provinces is refused as a stale offer", async () => {
  let writes = 0;
  const response = await handleDestinationRecommendationSelectionPost(tripId, "owner",
    { messageId: message.id, destinationIds: ["rec-a"] }, {
      async loadJourney() { return { tripState: state }; },
      async listMessages() { return [{ ...message, presentation: { type: "destination_recommendations" as const,
        destinations: [{ id: "rec-a", name: "花鸟岛", province: null, reason: "东海小岛，安静" }] } }]; },
      async updateTripState() { writes += 1; return state; },
      async checkReadiness() { return readySelected; },
      async persistFollowUp(input) { return followUp(input); },
    });
  assert.equal(response.status, 409);
  assert.equal(writes, 0);
});

test("a second click on the same cards returns the reply already written, in any order", async () => {
  const repository = new InMemoryTripMessageRepository();
  await repository.createMessage(message);
  let current = state;
  let writes = 0;
  const dependencies = {
    async loadJourney() { return { tripState: current }; },
    async listMessages() { return repository.listByTripId(tripId); },
    async updateTripState(_id: string, _owner: string, patch: TripStatePatch) {
      writes += 1;
      current = applyTripStatePatch(current, patch);
      return current;
    },
    async checkReadiness() { return readySelected; },
    async persistFollowUp(input: Parameters<typeof followUp>[0]) {
      return repository.createAssistantIfAbsent(followUp(input));
    },
  };
  const selection = { messageId: message.id, destinationIds: ["rec-a", "rec-b"] };
  const first = await handleDestinationRecommendationSelectionPost(tripId, "owner", selection, dependencies);
  assert.equal(first.status, 200);
  const firstBody = await first.json();
  assert.deepEqual(await repository.listByTripId(tripId), [message, firstBody.assistantMessage]);

  const retry = await handleDestinationRecommendationSelectionPost(tripId, "owner",
    { messageId: message.id, destinationIds: ["rec-b", "rec-a"] }, dependencies);
  assert.equal(retry.status, 200);
  assert.deepEqual((await retry.json()).assistantMessage, firstBody.assistantMessage);
  assert.equal(writes, 1);
  assert.equal((await repository.listByTripId(tripId)).length, 2);

  // A different destination now holds the Journey, so the old cards are stale.
  const otherDestination = await handleDestinationRecommendationSelectionPost(tripId, "owner",
    selection, { ...dependencies, async loadJourney() {
      return { tripState: applyTripStatePatch(state,
        { destination: { state: "known", value: "别处", source: "user" } }) };
    } });
  assert.equal(otherDestination.status, 409);
});

test("the reply describes what readiness could confirm, not the card", async () => {
  const response = await handleDestinationRecommendationSelectionPost(tripId, "owner",
    { messageId: message.id, destinationIds: ["rec-a"] }, {
      async loadJourney() { return { tripState: state }; },
      async listMessages() { return [message]; },
      async updateTripState(_id, _owner, patch: TripStatePatch) { return applyTripStatePatch(state, patch); },
      async checkReadiness() { return { canProceed: false, reason: "destination_ambiguous" } as const; },
      async persistFollowUp(input) { return followUp(input); },
    });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.match(body.assistantMessage.content, /目的地定为浙江省 舟山市了/u);
  assert.match(body.assistantMessage.content, /还需要确定具体地点/u);
  assert.doesNotMatch(body.assistantMessage.content, /现在已经可以开始生成旅行计划/u);
});

test("a failed state update writes no reply, and a failed reply still reports the saved state", async () => {
  let followUps = 0;
  const failedWrite = await handleDestinationRecommendationSelectionPost(tripId, "owner",
    { messageId: message.id, destinationIds: ["rec-a"] }, {
      async loadJourney() { return { tripState: state }; },
      async listMessages() { return [message]; },
      async updateTripState() { throw new Error("write failed"); },
      async checkReadiness() { return readySelected; },
      async persistFollowUp(input) { followUps += 1; return followUp(input); },
    });
  assert.equal(failedWrite.status, 500);
  assert.equal(followUps, 0);
  assert.equal((await failedWrite.json()).tripState, undefined);

  const failedReply = await handleDestinationRecommendationSelectionPost(tripId, "owner",
    { messageId: message.id, destinationIds: ["rec-a"] }, {
      async loadJourney() { return { tripState: state }; },
      async listMessages() { return [message]; },
      async updateTripState(_id, _owner, patch: TripStatePatch) { return applyTripStatePatch(state, patch); },
      async checkReadiness() { return readySelected; },
      async persistFollowUp() { throw new Error("follow-up failed"); },
    });
  assert.equal(failedReply.status, 500);
  const body = await failedReply.json();
  assert.equal(body.code, "follow_up_unavailable");
  assert.equal(body.tripState.destination.value, "浙江省 舟山市");
});
