import assert from "node:assert/strict";
import test from "node:test";

import type { TripMessage } from "@/domain/trip-message/trip-message";
import type { TripState } from "@/domain/trip-state/trip-state";
import type { WorkspaceConversationInterpretation } from "@/domain/trip-state/workspace-conversation";
import {
  createPendingRecommendations,
  pendingRecommendationRequest,
  recommendationScopeForTurn,
} from "./destination-recommendation-use-case";

const tripId = "3d17d2c7-fd9b-4748-b751-3a76a9a920be";
const state: TripState = {
  name: { state: "missing" }, origin: { state: "missing" }, destination: { state: "missing" },
  startDate: { state: "missing" }, endDate: { state: "missing" },
  duration: { state: "missing" }, transportPreference: { state: "missing" },
};
const provinceOnly: TripState = { ...state, destination: { state: "known", source: "user",
  areas: [{ province: "云南省", places: [] }] } };
const placeChosen: TripState = { ...state, destination: { state: "known", source: "user",
  areas: [{ province: "云南省", places: [{ name: "丽江市", spots: ["玉龙雪山"] }] }] } };
const legacy: TripState = { ...state, destination: { state: "known", source: "user", areas: [], legacyText: "青岛" } };
const interpretation: WorkspaceConversationInterpretation = {
  destinationEdit: { operation: "none" }, presentationIntent: "destination_recommendations", changes: [],
  reply: "好，我按你说的挑几个地方。",
};
const elsewhere = { ...interpretation, presentationIntent: "destination_recommendations_elsewhere" as const };
const history: TripMessage[] = [
  { id: "u0", tripId, role: "user", content: "我喜欢徒步，喜欢高山", createdAt: "2026-09-26T00:00:00.000Z" },
  { id: "a0", tripId, role: "assistant", content: "你更想走成熟路线，还是小众一点？", createdAt: "2026-09-26T00:00:00.001Z" },
  { id: "u1", tripId, role: "user", content: "成熟的路线吧", createdAt: "2026-09-26T00:00:01.000Z" },
  { id: "a1", tripId, role: "assistant", content: "好，我挑几个成熟的方向。", createdAt: "2026-09-26T00:00:01.001Z",
    presentation: { type: "destination_recommendations_pending", scope: "within" } },
];
const recommendations = {
  content: "我按省份列了几个可以去的地方。",
  presentation: { type: "destination_recommendations" as const, destinations: [
    { id: "c1", name: "迪庆藏族自治州", province: "云南省", reason: "高山徒步" },
  ] },
};

test("no intent, or a destination nobody can recommend against, promises no cards", () => {
  assert.equal(recommendationScopeForTurn({ ...interpretation, presentationIntent: "none" }, state), null);
  assert.equal(recommendationScopeForTurn(interpretation, legacy), null);
  assert.equal(recommendationScopeForTurn(elsewhere, legacy), null);
});

test("an open 「去哪」 gets cards inside what is saved, including a province named on the same turn", () => {
  assert.equal(recommendationScopeForTurn(interpretation, state), "within");
  // 「我想去云南，想爬山」 lands 云南省 with nothing inside: the question is narrowed, not closed.
  assert.equal(recommendationScopeForTurn(interpretation, provinceOnly), "within");
  assert.equal(recommendationScopeForTurn(interpretation, placeChosen), null);
});

test("widening looks past what is saved, and with nothing saved it is just where to go", () => {
  assert.equal(recommendationScopeForTurn(elsewhere, placeChosen), "elsewhere");
  assert.equal(recommendationScopeForTurn(elsewhere, provinceOnly), "elsewhere");
  assert.equal(recommendationScopeForTurn(elsewhere, state), "within");
});

test("a pending reply is traced back to the user message it answered and the history before it", () => {
  const request = pendingRecommendationRequest(history, "a1");
  assert.deepEqual(request, { status: "found", scope: "within", userText: "成熟的路线吧",
    earlierMessages: history.slice(0, 2) });
  assert.deepEqual(pendingRecommendationRequest(history, "a0"), { status: "not_found" });
  assert.deepEqual(pendingRecommendationRequest(history, "missing"), { status: "not_found" });
  assert.deepEqual(pendingRecommendationRequest(history.slice(3), "a1"), { status: "not_found" });
});

test("cards are built from the stored request and real history, without a fabricated user message", async () => {
  const request = pendingRecommendationRequest(history, "a1");
  assert.equal(request.status, "found");
  if (request.status !== "found") return;
  let calls = 0;
  const result = await createPendingRecommendations({ tripId, tripState: state, request, requestId: "request-1" }, {
    async runWorkflow(context) {
      calls += 1;
      assert.equal(context.scope, "within");
      assert.deepEqual(context.conversationHistory, [
        { role: "user", content: history[0].content },
        { role: "assistant", content: history[1].content },
        { role: "user", content: "成熟的路线吧" },
      ]);
      return recommendations;
    },
  });
  assert.equal(calls, 1);
  assert.equal(result, recommendations);
});

test("a destination settled since the reply was written gets no cards", async () => {
  const request = pendingRecommendationRequest(history, "a1");
  if (request.status !== "found") throw new Error("expected a pending request");
  const result = await createPendingRecommendations({ tripId, tripState: placeChosen, request, requestId: "request-2" }, {
    async runWorkflow() { throw new Error("must not run"); },
  });
  assert.equal(result, null);
});

test("a workflow failure reaches the caller instead of becoming an empty answer", async () => {
  const request = pendingRecommendationRequest(history, "a1");
  if (request.status !== "found") throw new Error("expected a pending request");
  await assert.rejects(createPendingRecommendations({ tripId, tripState: state, request, requestId: "request-3" }, {
    async runWorkflow() { throw new Error("model unavailable"); },
  }), /model unavailable/u);
});
