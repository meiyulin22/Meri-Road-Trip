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
  id: "assistant-cards", tripId, role: "assistant", content: "你可以看看更想去哪一个。",
  createdAt: "2026-09-28T09:00:00.000Z",
  presentation: { type: "destination_recommendations", destinations: [
    { id: "rec-a", name: "花鸟岛", region: "浙江", reason: "东海小岛，安静", imageUrl: null },
    { id: "rec-b", name: "涠洲岛", region: "广西", reason: "火山岛海岸线", imageUrl: null },
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
    { messageId: message.id, destinationId: "rec-b" }, {
      async loadJourney(id, owner) { assert.equal(id, tripId); assert.equal(owner, "owner"); return { tripState: state }; },
      async listMessages() { return [message]; },
      async updateTripState(_id, _owner, patch: TripStatePatch) {
        writes += 1;
        assert.deepEqual(patch.destination, { state: "known", value: "涠洲岛", source: "user" });
        return applyTripStatePatch(state, patch);
      },
      async checkReadiness() { return readySelected; },
      async persistFollowUp(input) { return followUp(input); },
    });
  assert.equal(response.status, 200);
  assert.equal(writes, 1);
  const body = await response.json();
  assert.equal(body.tripState.destination.value, "涠洲岛");
  assert.match(body.assistantMessage.content, /目的地定为涠洲岛了/);
  assert.match(body.assistantMessage.content, /现在已经可以开始生成旅行计划/);
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
  const body = { messageId: message.id, destinationId: "rec-a" };
  assert.equal((await handleDestinationRecommendationSelectionPost(tripId, null, body, dependencies)).status, 404);
  assert.equal((await handleDestinationRecommendationSelectionPost(tripId, "wrong", body, dependencies)).status, 404);
  assert.equal(writes, 0);
});

test("a name from the request, an unknown card, and a candidate message cannot update TripState", async () => {
  let writes = 0;
  const dependencies = {
    async loadJourney() { return { tripState: state }; },
    async listMessages() { return [message, { ...message, id: "assistant-candidates",
      presentation: { type: "location_candidates" as const, candidates: [
        { providerId: "poi-a", name: "汕头市", region: "广东", address: null,
          longitude: 116.68, latitude: 23.35, coordinateSystem: "GCJ-02" as const },
      ] } }]; },
    async updateTripState() { writes += 1; return state; },
    async checkReadiness() { return readySelected; },
    async persistFollowUp(input: Parameters<typeof followUp>[0]) { return followUp(input); },
  };
  const attempts = [
    { messageId: message.id, destinationId: "rec-a", name: "伪造地点" },
    { messageId: message.id, destinationId: "rec-z" },
    { messageId: "missing", destinationId: "rec-a" },
    { messageId: "assistant-candidates", destinationId: "rec-a" },
    { messageId: message.id, destinationId: "" },
  ];
  for (const body of attempts) {
    assert.notEqual((await handleDestinationRecommendationSelectionPost(tripId, "owner", body, dependencies)).status, 200);
  }
  assert.equal(writes, 0);
});

test("a second click on the same card returns the reply already written", async () => {
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
  const selection = { messageId: message.id, destinationId: "rec-a" };
  const first = await handleDestinationRecommendationSelectionPost(tripId, "owner", selection, dependencies);
  assert.equal(first.status, 200);
  const firstBody = await first.json();
  assert.deepEqual(await repository.listByTripId(tripId), [message, firstBody.assistantMessage]);

  const retry = await handleDestinationRecommendationSelectionPost(tripId, "owner", selection, dependencies);
  assert.equal(retry.status, 200);
  assert.deepEqual((await retry.json()).assistantMessage, firstBody.assistantMessage);
  assert.equal(writes, 1);
  assert.equal((await repository.listByTripId(tripId)).length, 2);

  // A different destination now holds the Journey, so the old card is stale.
  const otherDestination = await handleDestinationRecommendationSelectionPost(tripId, "owner",
    selection, { ...dependencies, async loadJourney() {
      return { tripState: applyTripStatePatch(state,
        { destination: { state: "known", value: "别处", source: "user" } }) };
    } });
  assert.equal(otherDestination.status, 409);
});

test("the reply describes what the Location Provider could confirm, not the card", async () => {
  const response = await handleDestinationRecommendationSelectionPost(tripId, "owner",
    { messageId: message.id, destinationId: "rec-a" }, {
      async loadJourney() { return { tripState: state }; },
      async listMessages() { return [message]; },
      async updateTripState(_id, _owner, patch: TripStatePatch) { return applyTripStatePatch(state, patch); },
      async checkReadiness() { return { canProceed: false, reason: "destination_ambiguous" } as const; },
      async persistFollowUp(input) { return followUp(input); },
    });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.match(body.assistantMessage.content, /目的地定为花鸟岛了/);
  assert.match(body.assistantMessage.content, /还需要确定具体地点/);
  assert.doesNotMatch(body.assistantMessage.content, /现在已经可以开始生成旅行计划/);
});

test("a failed state update writes no reply, and a failed reply still reports the saved state", async () => {
  let followUps = 0;
  const failedWrite = await handleDestinationRecommendationSelectionPost(tripId, "owner",
    { messageId: message.id, destinationId: "rec-a" }, {
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
    { messageId: message.id, destinationId: "rec-a" }, {
      async loadJourney() { return { tripState: state }; },
      async listMessages() { return [message]; },
      async updateTripState(_id, _owner, patch: TripStatePatch) { return applyTripStatePatch(state, patch); },
      async checkReadiness() { return readySelected; },
      async persistFollowUp() { throw new Error("follow-up failed"); },
    });
  assert.equal(failedReply.status, 500);
  const body = await failedReply.json();
  assert.equal(body.code, "follow_up_unavailable");
  assert.equal(body.tripState.destination.value, "花鸟岛");
});
