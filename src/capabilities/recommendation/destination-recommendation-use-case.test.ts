import assert from "node:assert/strict";
import test from "node:test";

import type { TripMessage } from "@/domain/trip-message/trip-message";
import type { TripState } from "@/domain/trip-state/trip-state";
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
  destinationEdit: { operation: "none" }, presentationIntent: "destination_recommendations", changes: [],
  reply: "我可以推荐几个地方。",
};
/** What a turn did to the destination: what the model proposed, and what the write kept. */
const noDestinationChange = { proposed: false, written: false };
const destinationLanded = { proposed: true, written: true };
const destinationLost = { proposed: true, written: false };
const recommendations = {
  content: "结合你喜欢的徒步和高山，看看这几个方向。",
  presentation: { type: "destination_recommendations" as const, destinations: [
    { id: "c1", name: "迪庆藏族自治州", province: "云南省", reason: "高山徒步" },
    { id: "c2", name: "甘孜藏族自治州", province: "四川省", reason: "成熟路线" },
  ] },
};

test("presentation guard leaves normal text turns, direct destinations, and disambiguation alone", () => {
  assert.equal(shouldCreateConversationalRecommendations({ ...interpretation, presentationIntent: "none" }, state, noDestinationChange), false);
  assert.equal(shouldCreateConversationalRecommendations(interpretation,
    { ...state, destination: { state: "known" as const, source: "user", areas: [], legacyText: "青岛" } }, destinationLanded), false);
  // A destination the user named that never landed is the turn's news; cards would
  // quietly take the place of the sentence saying so.
  assert.equal(shouldCreateConversationalRecommendations(interpretation, state, destinationLost), false);
  assert.equal(shouldCreateConversationalRecommendations({ ...interpretation,
    destinationEdit:{operation:"add",places:["潮州","汕头"],broadRegion:"潮汕"} }, state, noDestinationChange), false);
  assert.equal(shouldCreateConversationalRecommendations(interpretation, state, noDestinationChange), true);
  // Clearing the destination on purpose reopens 「去哪」 rather than closing it.
  assert.equal(shouldCreateConversationalRecommendations(interpretation, state, destinationLanded), true);
});

test("a province the user named keeps 「去哪」 open, so the cards are still offered", () => {
  const area = { state: "known" as const, source: "user" as const,
    areas: [{ province: "云南省", places: [] }] };
  assert.equal(shouldCreateConversationalRecommendations(interpretation, { ...state, destination: area }, noDestinationChange), true);
  // 「我想去云南，想爬山」: the model proposes a plain known 云南 and only the write knows
  // it is a province, so it lands as 云南省 with nothing chosen inside. Judging the
  // proposal instead of the write declined the cards on the very turn that opened
  // the question — 云南省 was saved and no 市 was ever offered inside it.
  assert.equal(shouldCreateConversationalRecommendations(interpretation, { ...state, destination: area }, destinationLanded), true);
  const chosen = { state: "known" as const, source: "user" as const,
    areas: [{ province: "云南省", places:[{name:"丽江市",spots:[]}] }] };
  assert.equal(shouldCreateConversationalRecommendations(interpretation, { ...state, destination: chosen }, destinationLanded), false);
});

test("a normal text turn does not call the recommendation pipeline or persist a recommendation", async () => {
  let calls = 0;
  const result = await persistConversationalRecommendationTurn({
    tripId, ownerGuestId: "owner", tripState: state,
    interpretation: { ...interpretation, presentationIntent: "none" }, patch: null, persistedPatch: null,
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
    tripId, ownerGuestId: "owner", tripState: state, interpretation, patch: null, persistedPatch: null,
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
  // The cards came out, so the model's own sentence about what the user just said
  // is the text above them. The workflow's fixed sentence is only the fallback.
  assert.equal(messages[1].content, interpretation.reply);
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
    tripId, ownerGuestId: "owner", tripState: state, interpretation, patch: null, persistedPatch: null,
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
    tripId, ownerGuestId: "owner", tripState: state, interpretation, patch: null, persistedPatch: null,
    previousMessages: history, currentUserText: "国内吧，成熟的路线", requestId: "request-zero",
  }, {
    async runWorkflow() { return { content: "这次没有筛出合适的目的地。" }; },
    persistTurn: (input) => service.persistSuccessfulTurn(input),
  });
  assert.ok(messages);
  assert.equal(messages[1].presentation, undefined);
  // Nothing was found, so the model's reply promised cards that never came and the
  // workflow is the only thing that can say so.
  assert.equal(messages[1].content, "这次没有筛出合适的目的地。");
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
      tripId, ownerGuestId: "owner", tripState: state, interpretation, patch, persistedPatch: patch,
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
        assert.equal(input.assistantContent, interpretation.reply);
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

test("text turns and destination edits do not invoke recommendations",async()=>{
 for(const destinationEdit of [{operation:"none" as const},{operation:"add" as const,places:["梅里雪山"],broadRegion:null}]){
 let calls=0;const output={...interpretation,presentationIntent:"none" as const,destinationEdit};
 const result=await persistConversationalRecommendationTurn({tripId,ownerGuestId:"owner",tripState:state,interpretation:output,patch:null,persistedPatch:null,previousMessages:[],currentUserText:"我还想去梅里雪山",requestId:"guard"},{runWorkflow:async()=>{calls++;return recommendations;},persistTurn:async()=>{throw Error("must not persist");}});assert.equal(result,null);assert.equal(calls,0);
 }
});
