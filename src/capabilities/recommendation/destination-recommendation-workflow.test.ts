import assert from "node:assert/strict";
import test from "node:test";

import type { DestinationCandidate } from "@/domain/location/destination-candidates";
import type { TripState } from "@/domain/trip-state/trip-state";
import { enrichRankedTopThree } from "./enrich-ranked-destinations";
import type { DestinationRecommendationContext } from "./destination-recommendation-context";
import { runDestinationRecommendationWorkflow, type DestinationRecommendationWorkflowDependencies } from "./destination-recommendation-workflow";

const state: TripState = {
  name: { state: "missing" }, origin: { state: "missing" }, destination: { state: "missing" },
  startDate: { state: "missing" }, endDate: { state: "missing" },
  duration: { state: "missing" }, transportPreference: { state: "missing" },
};
const context: DestinationRecommendationContext = {
  source: "conversation", tripState: state, conversationHistory: [{ role: "user", content: "成熟的徒步路线" }],
};
const candidates: DestinationCandidate[] = Array.from({ length: 8 }, (_, index) => ({
  id: `c${index + 1}`, name: `路线${index + 1}`, region: "四川", preferenceRationale: "符合徒步偏好",
}));
const evidence = [{ authority: "park.gov.cn", sourceUrl: "https://park.gov.cn/notice",
  title: "通告", retrievedAt: "2026-09-27T00:00:00.000Z", excerpt: "官方通告" }];

function dependencies(options: { survivors?: number; discoveryFails?: boolean; accessFails?: string; image?: "amap" | "bocha" | "none" } = {}) {
  const calls = { generated: 0, rankedIds: [] as string[], amap: 0, bocha: 0, discoveryInGenerator: 0,
    discoveryInRanker: 0 };
  const survivors = options.survivors ?? 8;
  const deps: DestinationRecommendationWorkflowDependencies = {
    discovery: { async search() {
      if (options.discoveryFails) throw new Error("discovery unavailable");
      return [{ source: "search", title: "近期资料", url: "https://example.test/travel" }];
    } },
    async generateCandidates(input) {
      calls.generated += 1;
      calls.discoveryInGenerator = input.discoveryResults?.length ?? 0;
      assert.equal(input.tripState, state);
      return candidates;
    },
    access: { async check(candidate) {
      if (candidate.id === options.accessFails) throw new Error("lookup failed");
      return candidates.indexOf(candidate) < survivors
        ? { status: "clear", reason: "No restriction", evidence }
        : { status: "blocked", reason: "Official closure", evidence };
    } },
    async rank(_context, eligible, _requestId, discovery) {
      calls.rankedIds = eligible.map((candidate) => candidate.id);
      calls.discoveryInRanker = discovery.length;
      return eligible.slice(0, 3).map((candidate) => ({ candidate, reason: `适合${candidate.name}`, evidence: [] }));
    },
    enrich: (ranked) => enrichRankedTopThree(ranked, {
      amap: { async enrich() { calls.amap += 1; return { matched: true,
        imageUrl: options.image === "amap" ? "https://amap.example/photo.jpg" : null }; } },
      images: { async search() { calls.bocha += 1; return options.image === "bocha"
        ? [{ contentUrl: "https://image.example/photo.jpg", hostPageUrl: "https://page.example/photo", width: 800, height: 500 }]
        : []; } },
    }),
  };
  return { deps, calls };
}

test("eight candidates pass through access, ranking, and enrichment to three original cards", async () => {
  const { deps, calls } = dependencies({ survivors: 7, image: "amap" });
  const result = await runDestinationRecommendationWorkflow(context, "request-1", deps);
  assert.equal(calls.generated, 1);
  assert.equal(calls.discoveryInGenerator, 1);
  assert.equal(calls.discoveryInRanker, 1);
  assert.deepEqual(calls.rankedIds, candidates.slice(0, 7).map((candidate) => candidate.id));
  assert.deepEqual(result.presentation?.destinations.map(({ id, name, region, reason, imageUrl }) =>
    ({ id, name, region, reason, imageUrl })), candidates.slice(0, 3).map((candidate) => ({
      id: candidate.id, name: candidate.name, region: candidate.region,
      reason: `适合${candidate.name}`, imageUrl: "https://amap.example/photo.jpg",
    })));
  assert.equal(calls.amap, 3);
  assert.equal(calls.bocha, 0);
});

test("one failed access lookup stays eligible; discovery and image failures degrade", async () => {
  const { deps, calls } = dependencies({ survivors: 2, accessFails: "c3", discoveryFails: true, image: "none" });
  const result = await runDestinationRecommendationWorkflow(context, "request-2", deps);
  assert.equal(calls.discoveryInGenerator, 0);
  assert.equal(calls.discoveryInRanker, 0);
  assert.deepEqual(calls.rankedIds, ["c1", "c2", "c3"]);
  assert.deepEqual(result.presentation?.destinations.map((item) => item.imageUrl), [null, null, null]);
  assert.equal(calls.bocha, 3);
});

test("Bocha supplies an image only when Amap has none", async () => {
  const { deps, calls } = dependencies({ survivors: 1, image: "bocha" });
  const result = await runDestinationRecommendationWorkflow(context, "request-3", deps);
  assert.deepEqual(result.presentation?.destinations.map((item) => item.imageUrl), ["https://image.example/photo.jpg"]);
  assert.equal(calls.bocha, 1);
});

test("two, one, or zero survivors yield two, one, or no presentation without replacement", async () => {
  for (const count of [2, 1, 0]) {
    const { deps, calls } = dependencies({ survivors: count });
    const result = await runDestinationRecommendationWorkflow(context, `request-${count}`, deps);
    assert.equal(result.presentation?.destinations.length ?? 0, count);
    assert.deepEqual(calls.rankedIds, candidates.slice(0, count).map((candidate) => candidate.id));
    if (count === 0) assert.match(result.content, /没有筛出合适的目的地/);
  }
});

test("ranking failure aborts before enrichment", async () => {
  const { deps, calls } = dependencies();
  await assert.rejects(runDestinationRecommendationWorkflow(context, "request-fail", {
    ...deps, async rank() { throw new Error("ranker unavailable"); },
  }), /ranker unavailable/);
  assert.equal(calls.amap, 0);
});

test("eligible aliases are deduplicated before ranking; final provider duplicates retain the highest rank", async () => {
  const { deps } = dependencies();
  const pool = [
    { ...candidates[0], name: "梅里雪山", region: "云南" },
    { ...candidates[1], name: "梅 里 雪 山 景区", region: "云南省" },
    { ...candidates[2], name: "大理", region: "云南" },
    { ...candidates[3], name: "大理市", region: "云南" },
    ...candidates.slice(4),
  ];
  const snapshot = structuredClone(pool);
  const stateSnapshot = structuredClone(context.tripState);
  const result = await runDestinationRecommendationWorkflow(context, "dedupe", {
    ...deps,
    async generateCandidates() { return pool; },
    access: { async check() { return { status: "uncertain", reason: "Insufficient evidence" }; } },
    async rank(_context, eligible) {
      assert.deepEqual(eligible.map((item) => item.id), ["c1", "c3", "c4", "c5", "c6", "c7", "c8"]);
      assert.equal(eligible[0], pool[0]);
      return [eligible[1], eligible[0], eligible[2]].map((candidate) => ({ candidate, reason: `理由:${candidate.id}`, evidence: [] }));
    },
    enrich: (ranked) => enrichRankedTopThree(ranked, {
      amap: { async enrich(item) { return { matched: true, imageUrl: "https://example.test/photo.jpg",
        providerIdentity: item.name.startsWith("大理") ? "amap:dali" : "amap:meili" }; } },
      images: { async search() { throw new Error("Amap photo should win"); } },
    }),
  });
  assert.deepEqual(result.presentation?.destinations.map((item) => [item.id, item.name, item.reason]),
    [["c3", "大理", "理由:c3"], ["c1", "梅里雪山", "理由:c1"]]);
  assert.ok(result.presentation?.destinations.every((item) => !("providerIdentity" in item)));
  assert.deepEqual(pool, snapshot);
  assert.deepEqual(context.tripState, stateSnapshot);
});
