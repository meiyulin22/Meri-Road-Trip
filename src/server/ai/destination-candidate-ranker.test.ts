import assert from "node:assert/strict";
import test from "node:test";

import type { DestinationCandidate } from "@/domain/location/destination-candidates";
import type { TripState } from "@/domain/trip-state/trip-state";
import type { DiscoverySearchResult } from "@/server/discovery/discovery-search";
import type { DestinationRecommendationContext } from "./destination-recommendation-context";
import { rankDestinationCandidates, InvalidDestinationRankingOutputError } from "./destination-candidate-ranker";
import type { StructuredOutputModelClient, StructuredOutputModelRequest } from "./kimi-client";

const tripState: TripState = {
  name: { state: "missing" }, origin: { state: "known", value: "成都", source: "user" },
  destination: { state: "missing" }, startDate: { state: "missing" }, endDate: { state: "missing" },
  duration: { state: "missing" }, transportPreference: { state: "known", value: "public_transport", source: "user" },
};
const context: DestinationRecommendationContext = {
  source: "conversation", tripState,
  conversationHistory: [{ role: "user", content: "想去成熟的高山徒步路线" },
    { role: "assistant", content: "也许可以考虑海边" },
    { role: "user", content: "更想看雪山" }],
};
const candidates: DestinationCandidate[] = ["甲线", "乙线", "丙线", "丁线"].map((name, index) => ({
  id: `candidate-${index + 1}`, name, region: "四川", preferenceRationale: "可作为高山徒步探索方向。",
}));
const discovery: DiscoverySearchResult[] = [{ source: "search", title: "甲线高山徒步资料", url: "https://example.test/one",
  snippet: "提及雪山徒步。", publishedAt: "2026-09-25T00:00:00.000Z" }];
const ranked = (candidateId: string, evidenceIds: string[] = []) =>
  ({ candidateId, reason: "符合你偏好的高山徒步方向。", evidenceIds });
const output = (ids: string[]) => ({ rankings: ids.map((id) => ranked(id)) });
const model = (value: unknown, requests: StructuredOutputModelRequest[] = []): StructuredOutputModelClient => ({
  async generateStructuredOutput(request) {
    requests.push(request);
    return { content: JSON.stringify(value), model: "test", finishReason: "stop" };
  },
});

test("valid Top 3 preserves model order and maps IDs to original candidates without modifying access status", async () => {
  const requests: StructuredOutputModelRequest[] = [];
  const original = structuredClone(candidates);
  const result = await rankDestinationCandidates(context, candidates, "request-1", discovery,
    model({ rankings: [ranked("candidate-3", ["e1"]), ranked("candidate-1"), ranked("candidate-2")] }, requests));
  assert.deepEqual(result.map(({ candidate }) => candidate.id), ["candidate-3", "candidate-1", "candidate-2"]);
  assert.equal(result[0].candidate, candidates[2]);
  assert.deepEqual(result[0].evidence, discovery);
  assert.deepEqual(result[1].evidence, []);
  assert.deepEqual(candidates, original);
  assert.deepEqual(Object.keys(result[0]).sort(), ["candidate", "evidence", "reason"]);
  assert.equal(requests[0].operation, "destination_candidate_ranking");
  assert.equal(requests[0].tools, undefined);
  assert.deepEqual(requests[0].conversationHistory, context.conversationHistory);
  assert.match(requests[0].systemPrompt, /Prefer preferences expressed by the user/);
  assert.match(requests[0].systemPrompt, /Do not assess legality, safety, weather/);
  assert.match(requests[0].systemPrompt, /成都/);
  const input = JSON.parse(requests[0].userMessage ?? "");
  assert.equal(input.rankCount, 3);
  assert.deepEqual(input.eligibleCandidates, candidates);
  assert.equal(input.discoveryEvidence[0].id, "e1");
  assert.equal(input.discoveryEvidence[0].url, discovery[0].url);
  assert.equal((requests[0].jsonSchema.properties as Record<string, { minItems: number; maxItems: number }>).rankings.maxItems, 3);
});

test("candidate shortfall ranks every supplied candidate and empty input skips the model", async () => {
  for (const count of [1, 2]) {
    const requests: StructuredOutputModelRequest[] = [];
    const subset = candidates.slice(0, count);
    const result = await rankDestinationCandidates(context, subset, "request-2", [],
      model(output(subset.map(({ id }) => id)), requests));
    assert.deepEqual(result.map(({ candidate }) => candidate.id), subset.map(({ id }) => id));
    assert.equal((requests[0].jsonSchema.properties as Record<string, { minItems: number; maxItems: number }>).rankings.minItems, count);
    assert.deepEqual(JSON.parse(requests[0].userMessage ?? "").discoveryEvidence, []);
  }
  const empty = await rankDestinationCandidates(context, [], "request-3", [], {
    async generateStructuredOutput() { throw new Error("Model should not run"); },
  });
  assert.deepEqual(empty, []);
});

test("rejects duplicate, invented, excessive, or missing candidate IDs and blank reasons", async () => {
  const invalid: unknown[] = [
    output(["candidate-1", "candidate-1", "candidate-2"]),
    output(["candidate-1", "invented", "candidate-2"]),
    output(["candidate-1", "candidate-2", "candidate-3", "candidate-4"]),
    output(["candidate-1", "candidate-2"]),
    { rankings: [ranked("candidate-1"), ranked("candidate-2"), { ...ranked("candidate-3"), reason: "   " }] },
    { rankings: [ranked("candidate-1"), ranked("candidate-2"), { ...ranked("candidate-3"), name: "新目的地" }] },
    { rankings: [ranked("candidate-1"), ranked("candidate-2"), { ...ranked("candidate-3"), accessStatus: "clear" }] },
  ];
  for (const value of invalid) await assert.rejects(
    rankDestinationCandidates(context, candidates, "request-4", [], model(value)), InvalidDestinationRankingOutputError);
  await assert.rejects(rankDestinationCandidates(context, [candidates[0], candidates[0]], "request-5", [], model(output([]))),
    InvalidDestinationRankingOutputError);
});

test("evidence IDs must come from supplied discovery results; reasons cannot invent URLs", async () => {
  for (const value of [
    { rankings: [ranked("candidate-1", ["missing"]), ranked("candidate-2"), ranked("candidate-3")] },
    { rankings: [ranked("candidate-1", ["e1", "e1"]), ranked("candidate-2"), ranked("candidate-3")] },
    { rankings: [{ ...ranked("candidate-1"), reason: "见 https://invented.test" }, ranked("candidate-2"), ranked("candidate-3")] },
  ]) await assert.rejects(rankDestinationCandidates(context, candidates, "request-6", discovery, model(value)),
    InvalidDestinationRankingOutputError);
});

test("rejects truncated or empty model output", async () => {
  for (const response of [
    { content: JSON.stringify(output(["candidate-1", "candidate-2", "candidate-3"])), model: "test", finishReason: "length" },
    { content: null, model: "test", finishReason: "stop" },
  ]) await assert.rejects(rankDestinationCandidates(context, candidates, "request-7", [], {
    async generateStructuredOutput() { return response; },
  }), InvalidDestinationRankingOutputError);
});
