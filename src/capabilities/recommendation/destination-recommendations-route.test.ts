import assert from "node:assert/strict";
import test from "node:test";

import type { TripMessage } from "@/domain/trip-message/trip-message";
import type { TripState } from "@/domain/trip-state/trip-state";
import { handleDestinationRecommendationsPost } from "@/app/api/trips/[id]/destination-recommendations/route";
import { destinationRecommendationCardsMessageId } from "@/capabilities/conversation/destination-selection-message-id";

const tripId = "trip-cards";
const owner = "owner-a";
const state: TripState = {
  name: { state: "missing" }, origin: { state: "missing" }, destination: { state: "missing" },
  startDate: { state: "missing" }, endDate: { state: "missing" },
  duration: { state: "missing" }, transportPreference: { state: "missing" },
};
const conversation: TripMessage[] = [
  { id: "u1", tripId, role: "user", content: "你推荐一下呗，想安静一点", createdAt: "2026-10-03T00:00:00.000Z" },
  { id: "p1", tripId, role: "assistant", content: "好，我按「安静」挑几个地方。", createdAt: "2026-10-03T00:00:00.001Z",
    presentation: { type: "destination_recommendations_pending", scope: "within" } },
];
const cards = { content: "我按省份列了几个可以去的地方。", presentation: { type: "destination_recommendations" as const,
  destinations: [{ id: "c1", name: "湖州市", province: "浙江省", reason: "竹林清幽" }] } };

function dependencies(messages: TripMessage[], options: { tripState?: TripState; fail?: boolean } = {}) {
  const calls = { workflow: 0, persisted: [] as TripMessage[] };
  return { calls, deps: {
    loadJourney: async () => ({ tripState: options.tripState ?? state }),
    listMessages: async () => messages,
    async runWorkflow() {
      calls.workflow += 1;
      if (options.fail) throw new Error("model unavailable");
      return cards;
    },
    persistCards: async (input: { messageId: string; content: string; presentation?: TripMessage["presentation"] }) => {
      const message: TripMessage = { id: input.messageId, tripId, role: "assistant", content: input.content,
        ...(input.presentation ? { presentation: input.presentation } : {}), createdAt: "2026-10-03T00:00:05.000Z" };
      calls.persisted.push(message);
      return message;
    },
  } };
}

test("the latest pending reply gets its cards under one id derived from it", async () => {
  const { calls, deps } = dependencies(conversation);
  const response = await handleDestinationRecommendationsPost(tripId, owner, { messageId: "p1" }, "r1", deps);
  assert.equal(response.status, 200);
  const body = await response.json() as { assistantMessage: TripMessage };
  assert.equal(body.assistantMessage.id, destinationRecommendationCardsMessageId(tripId, "p1"));
  assert.equal(body.assistantMessage.presentation?.type, "destination_recommendations");
  assert.equal(calls.workflow, 1);
});

test("asking again after the cards exist returns them without running the workflow twice", async () => {
  const existing: TripMessage = { id: destinationRecommendationCardsMessageId(tripId, "p1"), tripId, role: "assistant",
    content: cards.content, presentation: cards.presentation, createdAt: "2026-10-03T00:00:05.000Z" };
  const { calls, deps } = dependencies([...conversation, existing]);
  const response = await handleDestinationRecommendationsPost(tripId, owner, { messageId: "p1" }, "r2", deps);
  assert.equal(response.status, 200);
  assert.equal(((await response.json()) as { assistantMessage: TripMessage }).assistantMessage.id, existing.id);
  assert.equal(calls.workflow, 0);
});

test("a reply the user has already moved past, or a destination settled meanwhile, gets no cards", async () => {
  const later: TripMessage = { id: "u2", tripId, role: "user", content: "算了先说时间", createdAt: "2026-10-03T00:00:09.000Z" };
  const moved = dependencies([...conversation, later]);
  const stale = await handleDestinationRecommendationsPost(tripId, owner, { messageId: "p1" }, "r3", moved.deps);
  assert.equal(stale.status, 409);
  assert.equal(moved.calls.workflow, 0);
  const settled = dependencies(conversation, { tripState: { ...state, destination: { state: "known", source: "user",
    areas: [{ province: "浙江省", places: [{ name: "湖州市", spots: [] }] }] } } });
  const changed = await handleDestinationRecommendationsPost(tripId, owner, { messageId: "p1" }, "r4", settled.deps);
  assert.equal(changed.status, 409);
  assert.equal(settled.calls.persisted.length, 0);
});

test("unknown messages, bad bodies and missing owners are refused; a failed workflow persists nothing", async () => {
  const { calls, deps } = dependencies(conversation, { fail: true });
  assert.equal((await handleDestinationRecommendationsPost(tripId, owner, { messageId: "u1" }, "r5", deps)).status, 404);
  assert.equal((await handleDestinationRecommendationsPost(tripId, owner, { messageId: "" }, "r6", deps)).status, 400);
  assert.equal((await handleDestinationRecommendationsPost(tripId, null, { messageId: "p1" }, "r7", deps)).status, 404);
  assert.equal((await handleDestinationRecommendationsPost(tripId, owner, { messageId: "p1" }, "r8", deps)).status, 502);
  assert.equal(calls.persisted.length, 0);
});
