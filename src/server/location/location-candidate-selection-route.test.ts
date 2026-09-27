import assert from "node:assert/strict";
import test from "node:test";

import type { TripMessage } from "@/domain/trip-message/trip-message";
import type { TripState, TripStatePatch } from "@/domain/trip-state/trip-state";
import { applyTripStatePatch } from "@/domain/trip-state/trip-state";
import { TripNotFoundError } from "@/domain/trip/trip-errors";
import { InMemoryTripMessageRepository } from "@/infrastructure/persistence/in-memory/in-memory-trip-message-repository";
import { checkGeneratePlanReadiness } from "@/server/location/generate-plan-readiness";
import { LocationService } from "@/server/location/location-service";
import { locationCandidateSelectionMessageId } from "@/server/trip-message/location-candidate-selection-id";

import { handleLocationCandidateSelectionPost } from "@/app/api/trips/[id]/location-candidate-selection/route";

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

function followUp(input: { tripId: string; candidateMessageId: string; candidateIndex: number; content: string }): TripMessage {
  return { id: locationCandidateSelectionMessageId(input.tripId, input.candidateMessageId, input.candidateIndex),
    tripId: input.tripId, role: "assistant", content: input.content,
    createdAt: "2026-09-26T00:00:01.000Z" };
}

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
    async checkReadiness() { return { canProceed: true, destination: "selected" } as const; },
    async persistFollowUp(input) { return followUp(input); },
  });
  assert.equal(response.status, 200);
  assert.equal(writes, 1);
  const body = await response.json();
  assert.equal(body.tripState.destination.value, "吉林");
  assert.equal(body.tripState.destination.selection.providerId, "poi-b");
  assert.equal(body.assistantMessage.role, "assistant");
  assert.match(body.assistantMessage.content, /目的地定为吉林了/);
  assert.doesNotMatch(body.assistantMessage.content, /poi-b|坐标|匹配到地点/);
});

test("one verified candidate still requires explicit selection and saves its provider identity", async () => {
  const single: TripMessage = { ...message, presentation: {
    type: "location_candidates", candidates: [message.presentation!.type === "location_candidates"
      ? message.presentation!.candidates[0] : assert.fail("expected candidates")],
  } };
  const response = await handleLocationCandidateSelectionPost(tripId, "owner",
    { messageId: single.id, candidateIndex: 0 }, {
      async loadJourney() { return { tripState: state }; },
      async listMessages() { return [single]; },
      async updateTripState(_id, _owner, patch) {
        return applyTripStatePatch(state, patch);
      },
      async checkReadiness() { return { canProceed: true, destination: "selected" } as const; },
      async persistFollowUp(input) { return followUp(input); },
    });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.tripState.destination.state, "known");
  assert.equal(body.tripState.destination.selection.providerId, "poi-a");
});

test("missing or wrong owner cannot select a candidate", async () => {
  let writes = 0;
  const deps = {
    async loadJourney() { throw new TripNotFoundError(tripId); },
    async listMessages() { return [message]; },
    async updateTripState() { writes += 1; return state; },
    async checkReadiness() { return { canProceed: true, destination: "selected" } as const; },
    async persistFollowUp(input: Parameters<typeof followUp>[0]) { return followUp(input); },
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
    async checkReadiness() { return { canProceed: true, destination: "selected" } as const; },
    async persistFollowUp(input: Parameters<typeof followUp>[0]) { return followUp(input); },
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

test("successful selection persists one follow-up, returns it, and restores it on refresh or retry", async () => {
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
    async checkReadiness(tripState: TripState) {
      return checkGeneratePlanReadiness(tripState, new LocationService({
        async searchByKeyword() { throw new Error("selected destination should not search"); },
      }));
    },
    async persistFollowUp(input: Parameters<typeof followUp>[0]) {
      return repository.createAssistantIfAbsent(followUp(input));
    },
  };
  const selection = { messageId: message.id, candidateIndex: 0 };
  const first = await handleLocationCandidateSelectionPost(tripId, "owner", selection, dependencies);
  assert.equal(first.status, 200);
  const firstBody = await first.json();
  assert.deepEqual(firstBody.tripState, current);
  assert.equal(firstBody.assistantMessage.role, "assistant");
  assert.match(firstBody.assistantMessage.content, /现在已经可以开始生成旅行计划/);
  assert.match(firstBody.assistantMessage.content, /Generate plan/);
  assert.match(firstBody.assistantMessage.content, /出发时间和行程天数/);
  assert.doesNotMatch(firstBody.assistantMessage.content, /poi-a|吉林省|126\.55|匹配到地点/);
  assert.deepEqual(await repository.listByTripId(tripId), [message, firstBody.assistantMessage]);

  const retry = await handleLocationCandidateSelectionPost(tripId, "owner", selection, dependencies);
  assert.equal(retry.status, 200);
  assert.deepEqual((await retry.json()).assistantMessage, firstBody.assistantMessage);
  assert.equal(writes, 1);
  assert.equal((await repository.listByTripId(tripId)).length, 2);
});

test("failed state update creates no follow-up", async () => {
  let followUps = 0;
  const response = await handleLocationCandidateSelectionPost(tripId, "owner",
    { messageId: message.id, candidateIndex: 0 }, {
      async loadJourney() { return { tripState: state }; },
      async listMessages() { return [message]; },
      async updateTripState() { throw new Error("write failed"); },
      async checkReadiness() { return { canProceed: true, destination: "selected" } as const; },
      async persistFollowUp(input) { followUps += 1; return followUp(input); },
    });
  assert.equal(response.status, 500);
  assert.equal(followUps, 0);
  assert.equal((await response.json()).tripState, undefined);
});

test("follow-up is composed from the state returned by persistence", async () => {
  const finalState: TripState = { ...state,
    destination: { state: "known", value: "汕头老城", source: "user",
      selection: { provider: "amap", providerId: "poi-a" } },
    duration: { state: "known", value: "三天", source: "user" },
  };
  const response = await handleLocationCandidateSelectionPost(tripId, "owner",
    { messageId: message.id, candidateIndex: 0 }, {
      async loadJourney() { return { tripState: state }; },
      async listMessages() { return [message]; },
      async updateTripState() { return finalState; },
      async checkReadiness() { return { canProceed: true, destination: "selected" } as const; },
      async persistFollowUp(input) { return followUp(input); },
    });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.tripState, finalState);
  assert.match(body.assistantMessage.content, /汕头老城/);
  assert.match(body.assistantMessage.content, /行程时长也已经记下/);
  assert.doesNotMatch(body.assistantMessage.content, /吉林市|继续补充行程天数/);
});

test("failed follow-up persistence reports the saved authoritative state", async () => {
  const selected = applyTripStatePatch(state, { destination: {
    state: "known", value: "吉林市", source: "user",
    selection: { provider: "amap", providerId: "poi-a" },
  } });
  const response = await handleLocationCandidateSelectionPost(tripId, "owner",
    { messageId: message.id, candidateIndex: 0 }, {
      async loadJourney() { return { tripState: state }; },
      async listMessages() { return [message]; },
      async updateTripState() { return selected; },
      async checkReadiness() { return { canProceed: true, destination: "selected" } as const; },
      async persistFollowUp() { throw new Error("message write failed"); },
    });
  assert.equal(response.status, 500);
  const body = await response.json();
  assert.equal(body.code, "follow_up_unavailable");
  assert.deepEqual(body.tripState, selected);
  assert.equal(body.assistantMessage, undefined);
});

test("retry after follow-up failure saves the missing message once", async () => {
  const repository = new InMemoryTripMessageRepository();
  await repository.createMessage(message);
  let current = state;
  let attempts = 0;
  const dependencies = {
    async loadJourney() { return { tripState: current }; },
    async listMessages() { return repository.listByTripId(tripId); },
    async updateTripState(_id: string, _owner: string, patch: TripStatePatch) {
      current = applyTripStatePatch(current, patch);
      return current;
    },
    async checkReadiness() { return { canProceed: true, destination: "selected" } as const; },
    async persistFollowUp(input: Parameters<typeof followUp>[0]) {
      attempts += 1;
      if (attempts === 1) throw new Error("temporary message failure");
      return repository.createAssistantIfAbsent(followUp(input));
    },
  };
  const selection = { messageId: message.id, candidateIndex: 0 };
  const failed = await handleLocationCandidateSelectionPost(tripId, "owner", selection, dependencies);
  assert.equal(failed.status, 500);
  assert.equal((await repository.listByTripId(tripId)).length, 1);
  const recovered = await handleLocationCandidateSelectionPost(tripId, "owner", selection, dependencies);
  assert.equal(recovered.status, 200);
  assert.equal((await repository.listByTripId(tripId)).length, 2);
  assert.equal(attempts, 2);
});
