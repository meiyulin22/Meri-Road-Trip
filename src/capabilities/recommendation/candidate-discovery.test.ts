import assert from "node:assert/strict";
import test from "node:test";

import type { TripState } from "@/domain/trip-state/trip-state";
import { buildConversationalDestinationRecommendationContext } from "./destination-recommendation-context";
import { generateDestinationCandidates } from "./destination-candidate-generator";
import type { StructuredOutputModelClient, StructuredOutputModelRequest } from "@/platform/llm/kimi-client";
import { generateCandidatesWithDiscovery } from "./candidate-discovery";
import { buildDiscoveryQuery, searchJourneyDiscovery, type DiscoverySearchResult } from "@/platform/search/discovery-search";

const tripState: TripState = {
  name: { state: "missing" }, origin: { state: "known", value: "成都", source: "user" },
  destination: { state: "missing" }, startDate: { state: "missing" }, endDate: { state: "missing" },
  duration: { state: "missing" }, transportPreference: { state: "missing" },
};
const tripId = "3d17d2c7-fd9b-4748-b751-3a76a9a920be";
const history = [
  { id: "1", tripId, role: "user" as const, content: "我喜欢高山徒步", createdAt: "2026-09-27T00:00:00.000Z" },
  { id: "2", tripId, role: "assistant" as const, content: "某推荐不代表偏好", createdAt: "2026-09-27T00:00:01.000Z" },
];
const context = buildConversationalDestinationRecommendationContext(tripId, tripState, history, "国内成熟路线");
const discovery: DiscoverySearchResult = {
  source: "Example publisher", title: "Mountain route discussion",
  snippet: "People are discussing a mountain route.", url: "https://example.test/route",
};
const proposals = { candidates: Array.from({ length: 8 }, (_, index) => ({
  name: `地点${index + 1}`, region: "四川", preferenceRationale: "符合山地兴趣。",
})) };

test("constructs one deterministic query from authoritative origin and recent real user text", () => {
  assert.equal(buildDiscoveryQuery(context), "成都 国内成熟路线 我喜欢高山徒步");
  assert.equal(buildDiscoveryQuery(context), buildDiscoveryQuery(context));
  assert.doesNotMatch(buildDiscoveryQuery(context), /某推荐/);
});

test("discovery results reach the candidate generator as unverified inspiration", async () => {
  let searches = 0;
  const requests: StructuredOutputModelRequest[] = [];
  const client: StructuredOutputModelClient = { async generateStructuredOutput(request) {
    requests.push(request);
    return { content: JSON.stringify(proposals), model: "test", finishReason: "stop" };
  } };
  const candidates = await generateCandidatesWithDiscovery(context, "request-1", {
    async search(query) {
      searches += 1;
      assert.equal(query, "成都 国内成熟路线 我喜欢高山徒步");
      return [discovery];
    },
  }, (input, requestId) => generateDestinationCandidates(input, requestId, client));
  assert.equal(searches, 1);
  assert.equal(candidates.length, 8);
  assert.match(requests[0].systemPrompt, /Unverified discovery search results/);
  assert.match(requests[0].systemPrompt, /Mountain route discussion/);
  assert.match(requests[0].systemPrompt, /never proof of existence, access, legality, safety/);
  assert.deepEqual(Object.keys(candidates[0]).sort(), ["id", "name", "preferenceRationale", "region"]);
});

test("provider failure and empty results fall back to Journey context without logging secrets", async () => {
  for (const fail of [true, false]) {
    const logs: unknown[] = [];
    const results = await searchJourneyDiscovery(context, { async search() {
      if (fail) throw new Error("https://api.justoneapi.com/api/search/v1?token=secret-value");
      return [];
    } }, {
      info(fields: unknown) { logs.push(fields); },
      warn(fields: unknown) { logs.push(fields); },
    } as Parameters<typeof searchJourneyDiscovery>[2]);
    assert.deepEqual(results, []);
    assert.equal(logs.length, 1);
    assert.doesNotMatch(JSON.stringify(logs), /secret-value/);
    let receivedDiscovery = false;
    await generateCandidatesWithDiscovery(context, "request-2", { async search() {
      if (fail) throw new Error("provider unavailable");
      return [];
    } }, async (input) => {
      receivedDiscovery = "discoveryResults" in input;
      return [];
    });
    assert.equal(receivedDiscovery, false);
  }
});
