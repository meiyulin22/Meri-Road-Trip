import assert from "node:assert/strict";
import test from "node:test";

import type { TripMessage } from "@/domain/trip-message/trip-message";
import type { TripState } from "@/domain/trip-state/trip-state";
import type { StructuredOutputModelClient, StructuredOutputModelRequest } from "@/platform/llm/kimi-client";
import { buildConversationalDestinationRecommendationContext } from "./destination-recommendation-context";
import { generateDestinationRecommendations, InvalidDestinationRecommendationOutputError } from "./destination-recommendation-generator";

const tripId = "3d17d2c7-fd9b-4748-b751-3a76a9a920be";
const createdAt = "2026-09-26T00:00:00.000Z";
const tripState: TripState = {
  name: { state: "missing" }, origin: { state: "known", value: "成都", source: "user" },
  destination: { state: "missing" }, startDate: { state: "missing" },
  endDate: { state: "missing" }, duration: { state: "missing" },
  transportPreference: { state: "known", value: "public_transport", source: "user" },
};
const history: TripMessage[] = [
  { id: "u1", tripId, role: "user", content: "想出去走走，不自驾", createdAt },
  { id: "a1", tripId, role: "assistant", content: "可以慢慢决定目的地。", createdAt },
];
const valid = {
  provinces: [
    { province: "四川省", places: [
      { name: "甘孜藏族自治州", reason: "川西环线的主要一段" },
      { name: "阿坝藏族羌族自治州", reason: "高原草甸和雪山都在这里" },
    ] },
    { province: "云南省", places: [{ name: "迪庆藏族自治州", reason: "从成都坐车过去不难" }] },
  ],
};

const askedFor = "帮我推荐几个地方";

function context(state: TripState = tripState) {
  return buildConversationalDestinationRecommendationContext(tripId, state, history, askedFor, "within", "zh");
}

test("context carries how it was triggered, authoritative state, and only real history", () => {
  const built = context();
  assert.equal(built.source, "conversation");
  assert.equal(built.tripState, tripState);
  assert.deepEqual(built.conversationHistory, [
    { role: "user", content: history[0].content },
    { role: "assistant", content: history[1].content },
    { role: "user", content: askedFor },
  ]);
});

test("context writes out the cards an earlier recommendation showed", () => {
  const offered: TripMessage = { id: "a2", tripId, role: "assistant", content: "看看这些方向。",
    createdAt: history[1].createdAt, presentation: { type: "destination_recommendations",
      destinations: [{ id: "c1", name: "甘孜藏族自治州", province: "四川省" }] } };
  const built = buildConversationalDestinationRecommendationContext(tripId, tripState, [...history, offered], askedFor, "within", "zh");
  assert.deepEqual(built.conversationHistory.at(-2), {
    role: "assistant", content: "看看这些方向。\n[展示过的卡片] 四川省：甘孜藏族自治州",
  });
});

test("generator performs one structured call without fabricating a user message", async () => {
  const requests: StructuredOutputModelRequest[] = [];
  const client: StructuredOutputModelClient = {
    async generateStructuredOutput(request) {
      requests.push(request);
      return { content: JSON.stringify(valid), model: "test", finishReason: "stop" };
    },
  };
  const result = await generateDestinationRecommendations(context(), "request-1", client);
  assert.deepEqual(result, valid.provinces);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].userMessage, undefined);
  assert.equal(requests[0].tools, undefined);
  assert.deepEqual(requests[0].conversationHistory, [
    { role: "user", content: history[0].content },
    { role: "assistant", content: history[1].content },
    { role: "user", content: askedFor },
  ]);
  assert.match(requests[0].systemPrompt, /current real user message/u);
  // The prompt forbids the model from producing IDs, so none of ours may appear in it.
  assert.equal(requests[0].systemPrompt.includes(tripId), false);
  assert.match(requests[0].systemPrompt, /成都/u);
  assert.match(requests[0].systemPrompt, /prefecture-level city or autonomous prefecture/u);
  assert.match(requests[0].systemPrompt, /Never a province/u);
  assert.match(requests[0].systemPrompt, /No destination is settled yet/u);
  assert.match(requests[0].systemPrompt, /Never write such a line in your reply/u);
  const provinces = (requests[0].jsonSchema.properties as Record<string, Record<string, unknown>>).provinces;
  assert.equal(provinces.minItems, 1);
  assert.equal(provinces.maxItems, 4);
  const group = (provinces.items as { properties: Record<string, Record<string, unknown>> }).properties;
  assert.match(String(group.province.description), /Full province-level name/u);
  const place = (group.places.items as { properties: Record<string, { description: string }> }).properties;
  assert.match(place.name.description, /prefecture-level city or autonomous prefecture/u);
  assert.match(place.reason.description, /stated preferences/u);
});

test("a settled province is named in the prompt so the list stays inside it", async () => {
  const requests: StructuredOutputModelRequest[] = [];
  const client: StructuredOutputModelClient = {
    async generateStructuredOutput(request) {
      requests.push(request);
      return { content: JSON.stringify(valid), model: "test", finishReason: "stop" };
    },
  };
  await generateDestinationRecommendations(context({ ...tripState,
    destination: { state: "known" as const, source: "user", areas: [{ province: "海南省", places: [] }] } }), "request-1", client);
  assert.match(requests[0].systemPrompt, /already settled as 海南省/u);
  assert.doesNotMatch(requests[0].systemPrompt, /No destination is settled yet/u);
});

test("card reasons are written in the language chosen on the landing page, names stay Chinese", async () => {
  const requests: StructuredOutputModelRequest[] = [];
  const client: StructuredOutputModelClient = {
    async generateStructuredOutput(request) {
      requests.push(request);
      return { content: JSON.stringify(valid), model: "test", finishReason: "stop" };
    },
  };
  await generateDestinationRecommendations(context(), "request-zh", client);
  await generateDestinationRecommendations({ ...context(), locale: "en" }, "request-en", client);
  assert.match(requests[0].systemPrompt, /one short Simplified Chinese sentence, at most 30 characters/u);
  assert.match(requests[1].systemPrompt, /one short English sentence, at most 15 words/u);
  assert.match(requests[1].systemPrompt, /Write every reason in English, even when the conversation is in another language/u);
  assert.match(requests[1].systemPrompt, /Province, place and landmark names stay in Chinese/u);
  assert.doesNotMatch(requests[1].systemPrompt, /in Chinese, from the authoritative TripState/u);
});

test("discovery results are marked unverified when they are given to the model", async () => {
  const requests: StructuredOutputModelRequest[] = [];
  const client: StructuredOutputModelClient = {
    async generateStructuredOutput(request) {
      requests.push(request);
      return { content: JSON.stringify(valid), model: "test", finishReason: "stop" };
    },
  };
  await generateDestinationRecommendations({ ...context(), discoveryResults: [
    { source: "search", title: "近期资料", url: "https://example.test/travel" },
  ] }, "request-1", client);
  assert.match(requests[0].systemPrompt, /Unverified discovery search results/u);
  assert.match(requests[0].systemPrompt, /never proof of existence, access, legality, safety, or current conditions/u);
});

test("rejects malformed, out-of-shape, and truncated structured output", async () => {
  for (const response of [
    { content: JSON.stringify({ provinces: [] }), finishReason: "stop" },
    { content: JSON.stringify({ provinces: [{ province: "四川省", places: [] }] }), finishReason: "stop" },
    { content: JSON.stringify({ destinations: valid.provinces[0].places }), finishReason: "stop" },
    { content: "not json", finishReason: "stop" },
    { content: "", finishReason: "stop" },
    { content: JSON.stringify(valid), finishReason: "length" },
  ]) {
    const client: StructuredOutputModelClient = {
      async generateStructuredOutput() { return { ...response, model: "test" }; },
    };
    await assert.rejects(
      generateDestinationRecommendations(context(), "request-1", client),
      InvalidDestinationRecommendationOutputError,
      response.content.slice(0, 40),
    );
  }
});

test("provider failure propagates without returning invented recommendations", async () => {
  const failure = new Error("provider failed");
  const client: StructuredOutputModelClient = {
    async generateStructuredOutput() { throw failure; },
  };
  await assert.rejects(
    generateDestinationRecommendations(context(), "request-1", client),
    (error: unknown) => error === failure,
  );
});
