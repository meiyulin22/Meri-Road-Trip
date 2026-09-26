import assert from "node:assert/strict";
import test from "node:test";

import { handleDestinationRecommendationsPost } from "@/app/api/trips/[id]/destination-recommendations/route";
import type { TripMessage } from "@/domain/trip-message/trip-message";
import type { TripState } from "@/domain/trip-state/trip-state";
import type { TripUserAction } from "@/domain/trip-user-action/trip-user-action";
import { TripNotFoundError } from "@/domain/trip/trip-errors";
import type { DestinationRecommendationContext } from "./destination-recommendation-context";
import { InvalidDestinationRecommendationOutputError } from "./destination-recommendation-generator";

const tripId = "3d17d2c7-fd9b-4748-b751-3a76a9a920be";
const state: TripState = {
  name: { state: "missing" }, origin: { state: "missing" }, destination: { state: "missing" },
  startDate: { state: "missing" }, endDate: { state: "missing" },
  duration: { state: "missing" }, transportPreference: { state: "missing" },
};
const messages: TripMessage[] = [
  { id: "real-user", tripId, role: "user", content: "我想旅行", createdAt: "2026-09-26T00:00:00.000Z" },
];
const recommendations = {
  reply: "先看看三个方向。",
  destinations: [
    { name: "甲", region: null, reason: "一个方向" },
    { name: "乙", region: null, reason: "另一个方向" },
    { name: "丙", region: null, reason: "第三个方向" },
  ],
};

test("persists action before generation and uses the persisted record in dedicated context", async () => {
  const calls: string[] = [];
  let persisted: TripUserAction | null = null;
  let persistedMessage: TripMessage | null = null;
  const receivedContexts: DestinationRecommendationContext[] = [];
  const result = await handleDestinationRecommendationsPost(tripId, "owner", {
    async loadJourney(id, owner) {
      calls.push("load");
      assert.equal(id, tripId);
      assert.equal(owner, "owner");
      return { tripState: state };
    },
    async persistAction(action) {
      calls.push("persist");
      assert.equal(action.type, "request_destination_recommendations");
      persisted = { ...action, createdAt: "2026-09-26T01:00:00.000Z" };
      return persisted;
    },
    async listMessages() { calls.push("history"); return messages; },
    async generate(context) {
      calls.push("generate");
      receivedContexts.push(context);
      return recommendations;
    },
    async enrich(recommendation) {
      calls.push("enrich");
      return recommendation.name === "乙"
        ? { matched: true, imageUrl: null }
        : { matched: true, imageUrl: `https://amap.example/${recommendation.name}.jpg` };
    },
    async persistMessage(message) { calls.push("message"); persistedMessage = message; },
  }, "request-1");
  assert.equal(result.status, 200);
  const body = await result.json();
  assert.deepEqual(body.message, persistedMessage);
  assert.equal(body.message.role, "assistant");
  assert.equal(body.message.content, recommendations.reply);
  assert.equal(body.message.presentation.destinations.length, 3);
  assert.equal(new Set(body.message.presentation.destinations.map((item: { id: string }) => item.id)).size, 3);
  assert.deepEqual(body.message.presentation.destinations.map((item: { name: string; imageUrl: string | null }) => ({
    name: item.name, imageUrl: item.imageUrl,
  })), [
    { name: "甲", imageUrl: "https://amap.example/甲.jpg" },
    { name: "乙", imageUrl: null },
    { name: "丙", imageUrl: "https://amap.example/丙.jpg" },
  ]);
  assert.deepEqual(calls, ["load", "persist", "history", "generate", "enrich", "enrich", "enrich", "message"]);
  assert.deepEqual(receivedContexts[0].action, persisted);
  assert.equal(receivedContexts[0].tripState, state);
  assert.deepEqual(receivedContexts[0].conversationHistory, [{ role: "user", content: "我想旅行" }]);
  assert.deepEqual(messages, [{ id: "real-user", tripId, role: "user", content: "我想旅行", createdAt: "2026-09-26T00:00:00.000Z" }]);
});

test("missing or wrong owner cannot persist an action", async () => {
  let writes = 0;
  const deps = {
    async loadJourney() { throw new TripNotFoundError(tripId); },
    async persistAction(action: TripUserAction) { writes += 1; return action; },
    async listMessages() { return messages; },
    async generate() { return recommendations; },
    async enrich() { return { matched: false, imageUrl: null }; },
    async persistMessage() { writes += 1; },
  };
  assert.equal((await handleDestinationRecommendationsPost(tripId, null, deps)).status, 404);
  assert.equal((await handleDestinationRecommendationsPost(tripId, "wrong", deps)).status, 404);
  assert.equal(writes, 0);
});

test("authoritative destination change prevents action and model call", async () => {
  let calls = 0;
  const result = await handleDestinationRecommendationsPost(tripId, "owner", {
    async loadJourney() {
      return { tripState: { ...state, destination: { state: "known" as const, value: "成都", source: "user" as const } } };
    },
    async persistAction(action) { calls += 1; return action; },
    async listMessages() { calls += 1; return messages; },
    async generate() { calls += 1; return recommendations; },
    async enrich() { calls += 1; return { matched: false, imageUrl: null }; },
    async persistMessage() { calls += 1; },
  });
  assert.equal(result.status, 409);
  assert.equal(calls, 0);
});

test("model failure returns error after action was persisted, with no fabricated conversation", async () => {
  let persisted = false;
  let historyReads = 0;
  const result = await handleDestinationRecommendationsPost(tripId, "owner", {
    async loadJourney() { return { tripState: state }; },
    async persistAction(action) { persisted = true; return action; },
    async listMessages() { historyReads += 1; return messages; },
    async generate() { throw new InvalidDestinationRecommendationOutputError("invalid output"); },
    async enrich() { throw new Error("must not enrich"); },
    async persistMessage() { throw new Error("must not persist"); },
  });
  assert.equal(result.status, 502);
  assert.equal(persisted, true);
  assert.equal(historyReads, 1);
  assert.equal(messages.length, 1);
});

test("provider failures do not prevent a persisted recommendation, but message write failures do", async () => {
  let writes = 0;
  const deps = {
    async loadJourney() { return { tripState: state }; },
    async persistAction(action: TripUserAction) { return action; },
    async listMessages() { return messages; },
    async generate() { return recommendations; },
    async enrich() { throw new Error("provider unavailable"); },
    async persistMessage() { writes += 1; },
  };
  const success = await handleDestinationRecommendationsPost(tripId, "owner", deps);
  assert.equal(success.status, 200);
  assert.equal(writes, 1);
  const failure = await handleDestinationRecommendationsPost(tripId, "owner", {
    ...deps, async persistMessage() { throw new Error("database unavailable"); },
  });
  assert.equal(failure.status, 500);
});
