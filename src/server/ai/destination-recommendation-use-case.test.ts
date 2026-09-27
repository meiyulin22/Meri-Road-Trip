import assert from "node:assert/strict";
import test from "node:test";

import type { TripMessage } from "@/domain/trip-message/trip-message";
import type { TripState } from "@/domain/trip-state/trip-state";
import type { WorkspaceConversationInterpretation } from "@/domain/trip-state/workspace-conversation";
import { InMemoryTripMessageRepository } from "@/infrastructure/persistence/in-memory/in-memory-trip-message-repository";
import { TripMessageService } from "@/server/trip-message/trip-message-service";
import { persistConversationalRecommendationTurn, shouldCreateConversationalRecommendations } from "./destination-recommendation-use-case";

const tripId = "3d17d2c7-fd9b-4748-b751-3a76a9a920be";
const state: TripState = {
  name: { state: "missing" }, origin: { state: "missing" }, destination: { state: "missing" },
  startDate: { state: "missing" }, endDate: { state: "missing" },
  duration: { state: "missing" }, transportPreference: { state: "missing" },
};
const history: TripMessage[] = [
  { id: "u0", tripId, role: "user", content: "我喜欢徒步，喜欢高山", createdAt: "2026-09-26T00:00:00.000Z" },
  { id: "a0", tripId, role: "assistant", content: "你想去国内还是国外？", createdAt: "2026-09-26T00:00:00.001Z" },
];
const interpretation: WorkspaceConversationInterpretation = {
  intent: "question", presentationIntent: "destination_recommendations", changes: [],
  reply: "我可以推荐几个地方。",
};
const recommendations = {
  content: "结合你喜欢的徒步和高山，看看这几个方向。",
  presentation: { type: "destination_recommendations" as const, destinations: [
    { id: "c1", name: "甲", region: null, reason: "高山徒步", imageUrl: null },
    { id: "c2", name: "乙", region: null, reason: "成熟路线", imageUrl: null },
  ] },
};

test("presentation guard leaves normal text turns, direct destinations, and disambiguation alone", () => {
  assert.equal(shouldCreateConversationalRecommendations({ ...interpretation, presentationIntent: "none" }, state, null), false);
  assert.equal(shouldCreateConversationalRecommendations(interpretation,
    { ...state, destination: { state: "known", value: "青岛", source: "user" } }, null), false);
  assert.equal(shouldCreateConversationalRecommendations(interpretation, state,
    { destination: { state: "known", value: "青岛", source: "user" } }), false);
  assert.equal(shouldCreateConversationalRecommendations({ ...interpretation,
    destinationDisambiguation: { state: "known", value: ["潮州", "汕头"] } }, state, null), false);
  assert.equal(shouldCreateConversationalRecommendations(interpretation, state, null), true);
});

test("a normal text turn does not call the recommendation pipeline or persist a recommendation", async () => {
  let calls = 0;
  const result = await persistConversationalRecommendationTurn({
    tripId, ownerGuestId: "owner", tripState: state,
    interpretation: { ...interpretation, presentationIntent: "none" }, patch: null,
    previousMessages: history, currentUserText: "我还在想", requestId: "request-1",
  }, {
    async runWorkflow() { calls += 1; return recommendations; },
    async persistTurn() { calls += 1; throw new Error("must not persist"); },
  });
  assert.equal(result, null);
  assert.equal(calls, 0);
});

test("conversational trigger uses real context and persists one assistant with cards that reload", async () => {
  const repository = new InMemoryTripMessageRepository();
  for (const message of history) await repository.createMessage(message);
  const service = new TripMessageService({
    tripService: { async getTripById() { return { id: tripId } as never; } }, repository,
  });
  let workflowCalls = 0;
  const currentUserText = "国内吧，成熟的路线";
  const messages = await persistConversationalRecommendationTurn({
    tripId, ownerGuestId: "owner", tripState: state, interpretation, patch: null,
    previousMessages: history, currentUserText, requestId: "request-1",
  }, {
    async runWorkflow(context) {
      workflowCalls += 1;
      assert.equal(context.source, "conversation");
      assert.equal("action" in context, false);
      assert.deepEqual(context.conversationHistory, [
        { role: "user", content: history[0].content },
        { role: "assistant", content: history[1].content },
        { role: "user", content: currentUserText },
      ]);
      return recommendations;
    },
    persistTurn: (input) => service.persistSuccessfulTurn(input),
  });
  assert.equal(workflowCalls, 1);
  assert.ok(messages);
  assert.equal(messages[0].content, currentUserText);
  assert.equal(messages[1].content, recommendations.content);
  assert.equal(messages[1].presentation?.type, "destination_recommendations");
  assert.equal(messages[1].presentation?.type === "destination_recommendations" &&
    messages[1].presentation.destinations.length, 2);
  const restored = await service.listMessages(tripId, "owner");
  assert.equal(restored.length, history.length + 2);
  assert.deepEqual(restored.slice(-2), messages);
  assert.equal(restored.filter((message) => message.role === "assistant").length, 2);
});

test("failed recommendation generation does not persist a successful turn", async () => {
  let writes = 0;
  await assert.rejects(persistConversationalRecommendationTurn({
    tripId, ownerGuestId: "owner", tripState: state, interpretation, patch: null,
    previousMessages: history, currentUserText: "国内吧，成熟的路线", requestId: "request-1",
  }, {
    async runWorkflow() { throw new Error("model failed"); },
    async persistTurn() { writes += 1; throw new Error("must not persist"); },
  }), /model failed/);
  assert.equal(writes, 0);
});

test("zero-result conversational workflow persists one user and one assistant without cards", async () => {
  const repository = new InMemoryTripMessageRepository();
  const service = new TripMessageService({
    tripService: { async getTripById() { return { id: tripId } as never; } }, repository,
  });
  const messages = await persistConversationalRecommendationTurn({
    tripId, ownerGuestId: "owner", tripState: state, interpretation, patch: null,
    previousMessages: history, currentUserText: "国内吧，成熟的路线", requestId: "request-zero",
  }, {
    async runWorkflow() { return { content: "这次没有筛出合适的目的地。" }; },
    persistTurn: (input) => service.persistSuccessfulTurn(input),
  });
  assert.ok(messages);
  assert.equal(messages[1].presentation, undefined);
  assert.equal((await service.listMessages(tripId, "owner")).length, 2);
});
