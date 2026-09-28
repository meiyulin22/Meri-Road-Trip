import assert from "node:assert/strict";
import test from "node:test";

import type { TripMessage } from "@/domain/trip-message/trip-message";
import type { TripState, TripStatePatch } from "@/domain/trip-state/trip-state";
import type { WorkspaceConversationInterpretation } from "@/domain/trip-state/workspace-conversation";
import { InMemoryTripMessageRepository } from "@/platform/persistence/in-memory/in-memory-trip-message-repository";
import { TripMessageService } from "@/capabilities/conversation/trip-message-service";
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
  assert.equal(shouldCreateConversationalRecommendations(interpretation, state,
    { destination: { state: "missing" } }), true);
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

test("meaningful preference turns invoke the shared workflow without optional Journey fields", async () => {
  const examples = ["想要海边、轻松一点、适合周末", "我喜欢雪山、徒步、不想太商业化",
    "想找好吃的，也想逛老城区", "国内，秋天，高山徒步，路线成熟一点"];
  for (const currentUserText of examples) {
    let workflowCalls = 0;
    let persistenceCalls = 0;
    const patch = currentUserText === examples[0]
      ? { duration: { state: "known" as const, value: "周末", source: "user" as const } }
      : currentUserText === examples[2] ? { destination: { state: "missing" as const } } : null;
    const result = await persistConversationalRecommendationTurn({
      tripId, ownerGuestId: "owner", tripState: state, interpretation, patch,
      previousMessages: [], currentUserText, requestId: "trigger-test",
    }, {
      async runWorkflow(context) {
        workflowCalls += 1;
        assert.deepEqual(context.conversationHistory, [{ role: "user", content: currentUserText }]);
        return recommendations;
      },
      async persistTurn(input) {
        persistenceCalls += 1;
        assert.equal(input.userContent, currentUserText);
        assert.deepEqual(input.assistantPresentation, recommendations.presentation);
        return [
          { id: "user", tripId, role: "user", content: currentUserText, createdAt: "2026-09-27T00:00:00.000Z" },
          { id: "assistant", tripId, role: "assistant", content: input.assistantContent,
            presentation: input.assistantPresentation, createdAt: "2026-09-27T00:00:01.000Z" },
        ] as const;
      },
    });
    assert.ok(result);
    assert.equal(workflowCalls, 1);
    assert.equal(persistenceCalls, 1);
  }
});

test("vague turns, factual questions, destination updates, and disambiguation do not invoke workflow", async () => {
  const cases: { text: string; output: WorkspaceConversationInterpretation; patch: TripStatePatch | null }[] = [
    ...["我想出去玩", "哪里好玩", "推荐个地方", "雪山徒步需要准备什么？"].map((text) =>
      ({ text, output: { ...interpretation, presentationIntent: "none" as const }, patch: null })),
    { text: "我想去青岛", output: interpretation,
      patch: { destination: { state: "known", value: "青岛", source: "user" } } },
    { text: "我想去潮汕", output: { ...interpretation,
      destinationDisambiguation: { state: "known", value: ["潮州", "汕头"] } }, patch: null },
  ];
  for (const { text, output, patch } of cases) {
    const result = await persistConversationalRecommendationTurn({
      tripId, ownerGuestId: "owner", tripState: state, interpretation: output, patch,
      previousMessages: [], currentUserText: text, requestId: "non-trigger-test",
    }, {
      async runWorkflow() { throw new Error("Workflow must not run"); },
      async persistTurn() { throw new Error("Turn must not be persisted here"); },
    });
    assert.equal(result, null, text);
  }
});
