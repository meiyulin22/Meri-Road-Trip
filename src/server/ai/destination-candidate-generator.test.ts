import assert from "node:assert/strict";
import test from "node:test";

import type { TripMessage } from "@/domain/trip-message/trip-message";
import type { TripState } from "@/domain/trip-state/trip-state";
import type { TripUserAction } from "@/domain/trip-user-action/trip-user-action";
import { buildConversationalDestinationRecommendationContext, buildDestinationRecommendationContext } from "./destination-recommendation-context";
import { generateDestinationCandidates, InvalidDestinationCandidateOutputError } from "./destination-candidate-generator";
import type { StructuredOutputModelClient, StructuredOutputModelRequest } from "./kimi-client";

const tripId = "3d17d2c7-fd9b-4748-b751-3a76a9a920be";
const tripState: TripState = {
  name: { state: "missing" }, origin: { state: "known", value: "成都", source: "user" },
  destination: { state: "missing" }, startDate: { state: "missing" },
  endDate: { state: "missing" }, duration: { state: "missing" },
  transportPreference: { state: "known", value: "public_transport", source: "user" },
};
const action: TripUserAction = {
  id: "00000000-0000-4000-8000-000000000005", tripId,
  type: "request_destination_recommendations", createdAt: "2026-09-26T00:00:00.000Z",
};
const messages: TripMessage[] = [
  { id: "u1", tripId, role: "user", content: "喜欢徒步和高山", createdAt: action.createdAt },
  { id: "a1", tripId, role: "assistant", content: "想去国内吗？", createdAt: action.createdAt },
];
const names = ["青城山", "峨眉山", "四姑娘山", "贡嘎山", "九寨沟", "稻城亚丁", "武功山", "黄山", "长白山", "天门山", "张家界"];
const pool = (count: number) => ({ candidates: names.slice(0, count).map((name) => ({
  name, region: "四川", preferenceRationale: "可作为山地徒步的探索方向。",
})) });
const model = (value: unknown, requests: StructuredOutputModelRequest[] = []): StructuredOutputModelClient => ({
  async generateStructuredOutput(request) {
    requests.push(request);
    return { content: JSON.stringify(value), model: "test", finishReason: "stop" };
  },
});

test("generates 8 to 10 distinct candidates and assigns IDs in application code", async () => {
  for (const count of [8, 10]) {
    const requests: StructuredOutputModelRequest[] = [];
    let nextId = 0;
    const candidates = await generateDestinationCandidates(
      buildDestinationRecommendationContext(action, tripState, messages), "request-1",
      model(pool(count), requests), () => `app-id-${++nextId}`);
    assert.equal(candidates.length, count);
    assert.deepEqual(candidates.map((candidate) => candidate.id),
      Array.from({ length: count }, (_, index) => `app-id-${index + 1}`));
    assert.equal(new Set(candidates.map((candidate) => candidate.name)).size, count);
    assert.deepEqual(Object.keys(candidates[0]).sort(), ["id", "name", "preferenceRationale", "region"]);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].operation, "destination_candidates");
    assert.equal(requests[0].tools, undefined);
    assert.equal(requests[0].userMessage, undefined);
    assert.deepEqual(requests[0].conversationHistory, messages.map(({ role, content }) => ({ role, content })));
    assert.match(requests[0].systemPrompt, /成都/);
    assert.match(requests[0].systemPrompt, /Do not rank candidates or choose a Top 3/);
    const output = requests[0].jsonSchema.properties as Record<string, { minItems: number; maxItems: number; items: { properties: Record<string, unknown> } }>;
    assert.equal(output.candidates.minItems, 8);
    assert.equal(output.candidates.maxItems, 10);
    assert.deepEqual(Object.keys(output.candidates.items.properties).sort(), ["name", "preferenceRationale", "region"]);
  }
});

test("conversational candidate context includes the real current user text", async () => {
  const requests: StructuredOutputModelRequest[] = [];
  await generateDestinationCandidates(
    buildConversationalDestinationRecommendationContext(tripId, tripState, messages, "国内成熟路线"),
    "request-2", model(pool(8), requests));
  assert.deepEqual(requests[0].conversationHistory?.at(-1), { role: "user", content: "国内成熟路线" });
  assert.match(requests[0].systemPrompt, /No UI action occurred/);
});

test("rejects invalid counts, duplicate names, invalid fields, and model-supplied metadata", async () => {
  const valid = pool(8);
  const cases: unknown[] = [
    pool(7),
    pool(11),
    { candidates: [...valid.candidates.slice(0, 7), { ...valid.candidates[7], name: " 青 城 山 " }] },
    { candidates: [...valid.candidates.slice(0, 7), { ...valid.candidates[7], name: " " }] },
    { candidates: [...valid.candidates.slice(0, 7), { ...valid.candidates[7], region: " " }] },
    { candidates: [...valid.candidates.slice(0, 7), { ...valid.candidates[7], preferenceRationale: " " }] },
    { candidates: [...valid.candidates.slice(0, 7), { ...valid.candidates[7], id: "model-id" }] },
    { candidates: [...valid.candidates.slice(0, 7), { ...valid.candidates[7], providerId: "poi-1" }] },
    { candidates: [...valid.candidates.slice(0, 7), { ...valid.candidates[7], coordinates: [0, 0] }] },
    { candidates: [...valid.candidates.slice(0, 7), { ...valid.candidates[7], imageUrl: "https://example.test/a.jpg" }] },
    { candidates: [...valid.candidates.slice(0, 7), { ...valid.candidates[7], accessStatus: "allowed" }] },
  ];
  for (const value of cases) {
    await assert.rejects(
      generateDestinationCandidates(buildDestinationRecommendationContext(action, tripState, messages), "request-3", model(value)),
      InvalidDestinationCandidateOutputError);
  }
});

test("rejects truncated output and duplicate application-generated IDs", async () => {
  const context = buildDestinationRecommendationContext(action, tripState, messages);
  await assert.rejects(generateDestinationCandidates(context, "request-4", {
    async generateStructuredOutput() { return { content: JSON.stringify(pool(8)), model: "test", finishReason: "length" }; },
  }), InvalidDestinationCandidateOutputError);
  await assert.rejects(generateDestinationCandidates(context, "request-4", model(pool(8)), () => "same-id"),
    InvalidDestinationCandidateOutputError);
});
