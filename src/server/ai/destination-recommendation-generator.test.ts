import assert from "node:assert/strict";
import test from "node:test";

import type { TripMessage } from "@/domain/trip-message/trip-message";
import type { TripState } from "@/domain/trip-state/trip-state";
import type { TripUserAction } from "@/domain/trip-user-action/trip-user-action";
import type { StructuredOutputModelClient, StructuredOutputModelRequest } from "./kimi-client";
import { buildDestinationRecommendationContext } from "./destination-recommendation-context";
import { generateDestinationRecommendations, InvalidDestinationRecommendationOutputError } from "./destination-recommendation-generator";

const tripId = "3d17d2c7-fd9b-4748-b751-3a76a9a920be";
const action: TripUserAction = {
  id: "00000000-0000-4000-8000-000000000005",
  tripId,
  type: "request_destination_recommendations",
  createdAt: "2026-09-26T00:00:00.000Z",
};
const tripState: TripState = {
  name: { state: "missing" }, origin: { state: "known", value: "成都", source: "user" },
  destination: { state: "missing" }, startDate: { state: "missing" },
  endDate: { state: "missing" }, duration: { state: "missing" },
  transportPreference: { state: "known", value: "public_transport", source: "user" },
};
const history: TripMessage[] = [
  { id: "u1", tripId, role: "user", content: "想出去走走，不自驾", createdAt: action.createdAt },
  { id: "a1", tripId, role: "assistant", content: "可以慢慢决定目的地。", createdAt: action.createdAt },
];
const valid = {
  reply: "结合你目前的想法，先看看这三个方向。",
  destinations: [
    { name: "都江堰", region: "四川", reason: "适合作为从成都出发的探索方向。" },
    { name: "青城山", region: "四川", reason: "可以考虑轻量户外体验。" },
    { name: "峨眉山", region: null, reason: "可以考虑山地旅行体验。" },
  ],
};

test("dedicated context contains persisted action, authoritative state, and only real history", () => {
  const context = buildDestinationRecommendationContext(action, tripState, history);
  assert.equal(context.action, action);
  assert.equal(context.tripState, tripState);
  assert.deepEqual(context.conversationHistory, [
    { role: "user", content: history[0].content },
    { role: "assistant", content: history[1].content },
  ]);
});

test("generator performs one structured call without fabricating a user message", async () => {
  const requests: StructuredOutputModelRequest[] = [];
  const client: StructuredOutputModelClient = {
    async generateStructuredOutput(request) {
      requests.push(request);
      return { content: JSON.stringify(valid), model: "test", finishReason: "stop" };
    },
  };
  const result = await generateDestinationRecommendations(
    buildDestinationRecommendationContext(action, tripState, history), "request-1", client);
  assert.deepEqual(result, valid);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].userMessage, undefined);
  assert.equal(requests[0].tools, undefined);
  assert.deepEqual(requests[0].conversationHistory, [
    { role: "user", content: history[0].content },
    { role: "assistant", content: history[1].content },
  ]);
  assert.match(requests[0].systemPrompt, new RegExp(action.id));
  assert.match(requests[0].systemPrompt, /成都/);
  const destinationsSchema = (requests[0].jsonSchema.properties as Record<string, Record<string, unknown>>).destinations;
  assert.equal(destinationsSchema.minItems, 3);
  assert.equal(destinationsSchema.maxItems, 3);
});

test("rejects incomplete, malformed, and truncated structured output", async () => {
  for (const response of [
    { content: JSON.stringify({ ...valid, destinations: valid.destinations.slice(0, 2) }), finishReason: "stop" },
    { content: JSON.stringify({ ...valid, destinations: [...valid.destinations, valid.destinations[0]] }), finishReason: "stop" },
    { content: JSON.stringify({ ...valid, reply: "" }), finishReason: "stop" },
    { content: "not json", finishReason: "stop" },
    { content: JSON.stringify(valid), finishReason: "length" },
  ]) {
    const client: StructuredOutputModelClient = {
      async generateStructuredOutput() { return { ...response, model: "test" }; },
    };
    await assert.rejects(
      generateDestinationRecommendations(buildDestinationRecommendationContext(action, tripState, history), "request-1", client),
      InvalidDestinationRecommendationOutputError,
    );
  }
});

test("provider failure propagates without returning invented recommendations", async () => {
  const failure = new Error("provider failed");
  const client: StructuredOutputModelClient = {
    async generateStructuredOutput() { throw failure; },
  };
  await assert.rejects(
    generateDestinationRecommendations(buildDestinationRecommendationContext(action, tripState, history), "request-1", client),
    (error: unknown) => error === failure,
  );
});
