import assert from "node:assert/strict";
import test from "node:test";

import type { DestinationRecommendationGroup } from "@/domain/location/destination-recommendations";
import type { TripState } from "@/domain/trip-state/trip-state";
import type { DestinationRecommendationContext } from "./destination-recommendation-context";
import { runDestinationRecommendationWorkflow, type DestinationRecommendationWorkflowDependencies } from "./destination-recommendation-workflow";

const state: TripState = {
  name: { state: "missing" }, origin: { state: "missing" }, destination: { state: "missing" },
  startDate: { state: "missing" }, endDate: { state: "missing" },
  duration: { state: "missing" }, transportPreference: { state: "missing" },
};
const context: DestinationRecommendationContext = {
  source: "conversation", scope: "within", tripState: state, conversationHistory: [{ role: "user", content: "成熟的徒步路线" }],
};
const groups: readonly DestinationRecommendationGroup[] = [
  { province: "云南省", places: [
    { name: "丽江市", reason: "古城和雪山都在一天路程里" },
    { name: "迪庆藏族自治州", reason: "适合看高原草甸" },
  ] },
  { province: "四川省", places: [{ name: "甘孜藏族自治州", reason: "川西环线的主要一段" }] },
];

function dependencies(options: { discoveryFails?: boolean; generated?: readonly DestinationRecommendationGroup[] } = {}) {
  const calls = { generated: 0, discoveryGiven: -1, ids: 0 };
  const deps: DestinationRecommendationWorkflowDependencies = {
    discovery: { async search() {
      if (options.discoveryFails) throw new Error("discovery unavailable");
      return [{ source: "search", title: "近期资料", url: "https://example.test/travel" }];
    } },
    async generate(input) {
      calls.generated += 1;
      calls.discoveryGiven = input.discoveryResults?.length ?? 0;
      return options.generated ?? groups;
    },
    generateId: () => { calls.ids += 1; return `id-${calls.ids}`; },
    photos: { async findPhoto() { return null; } },
  };
  return { deps, calls };
}

test("every recommended place becomes one card that keeps its province and its order", async () => {
  const { deps, calls } = dependencies();
  const result = await runDestinationRecommendationWorkflow(context, "request-1", deps);
  assert.equal(calls.generated, 1);
  assert.equal(calls.discoveryGiven, 1);
  assert.deepEqual(result.presentation?.destinations, [
    { id: "id-1", name: "丽江市", province: "云南省", reason: "古城和雪山都在一天路程里" },
    { id: "id-2", name: "迪庆藏族自治州", province: "云南省", reason: "适合看高原草甸" },
    { id: "id-3", name: "甘孜藏族自治州", province: "四川省", reason: "川西环线的主要一段" },
  ]);
  assert.match(result.content, /想去哪些都可以选上/u);
});

test("a discovery failure degrades instead of aborting, and nothing unverified reaches the model", async () => {
  const { deps, calls } = dependencies({ discoveryFails: true });
  const result = await runDestinationRecommendationWorkflow(context, "request-2", deps);
  assert.equal(calls.discoveryGiven, 0);
  assert.equal(result.presentation?.destinations.length, 3);
});

test("a settled province keeps its own spelling and drops places proposed outside it", async () => {
  const settled: DestinationRecommendationContext = { ...context, tripState: { ...state,
    destination: { state: "known" as const, source: "user", areas: [{ province: "云南省", places: [] }] } } };
  const { deps } = dependencies({ generated: [
    { province: "云南", places: [{ name: "丽江市", reason: "古城和雪山都在一天路程里" }] },
    { province: "四川省", places: [{ name: "甘孜藏族自治州", reason: "川西环线的主要一段" }] },
  ] });
  const result = await runDestinationRecommendationWorkflow(settled, "request-3", deps);
  assert.deepEqual(result.presentation?.destinations,
    [{ id: "id-1", name: "丽江市", province: "云南省", reason: "古城和雪山都在一天路程里" }]);
});

test("nothing left inside the settled provinces is said in words, with no empty list to pick from", async () => {
  const settled: DestinationRecommendationContext = { ...context, tripState: { ...state,
    destination: { state: "known" as const, source: "user", areas: [{ province: "海南省", places: [] }] } } };
  const { deps } = dependencies();
  const result = await runDestinationRecommendationWorkflow(settled, "request-4", deps);
  assert.equal(result.presentation, undefined);
  assert.match(result.content, /没有筛出合适的目的地/u);
});

test("a generation failure reaches the caller rather than becoming an empty list", async () => {
  const { deps } = dependencies();
  await assert.rejects(runDestinationRecommendationWorkflow(context, "request-5", {
    ...deps, async generate() { throw new Error("model unavailable"); },
  }), /model unavailable/u);
});

test("widening a trip drops every province already saved, whatever spelling the model used", async () => {
  const saved: DestinationRecommendationContext = { ...context, scope: "elsewhere", tripState: { ...state,
    destination: { state: "known" as const, source: "user", areas: [
      { province: "云南省", places: [{ name: "丽江市", spots: ["玉龙雪山"] }] }] } } };
  const { deps } = dependencies({ generated: [
    { province: "云南", places: [{ name: "大理白族自治州", reason: "苍山洱海" }] },
    { province: "四川省", places: [{ name: "甘孜藏族自治州", reason: "川西环线的主要一段" }] },
  ] });
  const result = await runDestinationRecommendationWorkflow(saved, "request-6", deps);
  assert.deepEqual(result.presentation?.destinations,
    [{ id: "id-1", name: "甘孜藏族自治州", province: "四川省", reason: "川西环线的主要一段" }]);
});

test("nothing found outside the saved provinces is said as such", async () => {
  const saved: DestinationRecommendationContext = { ...context, scope: "elsewhere", tripState: { ...state,
    destination: { state: "known" as const, source: "user", areas: [{ province: "云南省", places: [] },
      { province: "四川省", places: [] }] } } };
  const { deps } = dependencies();
  const result = await runDestinationRecommendationWorkflow(saved, "request-7", deps);
  assert.equal(result.presentation, undefined);
  assert.match(result.content, /其他省份/u);
});

test("each card's photo is looked up by its landmark inside its place, and a card without one still shows", async () => {
  const { deps } = dependencies({ generated: [{ province: "云南省", places: [
    { name: "丽江市", reason: "雪山古城", landmark: "玉龙雪山" },
    { name: "迪庆藏族自治州", reason: "高原草甸" },
  ] }] });
  const asked: unknown[] = [];
  const image = { url: "https://store.is.autonavi.com/showpic/yl", caption: "玉龙雪山国家级风景名胜区" };
  const result = await runDestinationRecommendationWorkflow(context, "request-8", { ...deps, photos: { async findPhoto(query) {
    asked.push(query);
    return query.kind === "named" && query.keywords === "玉龙雪山" ? image : null;
  } } });
  assert.deepEqual(result.presentation?.destinations, [
    { id: "id-1", name: "丽江市", province: "云南省", reason: "雪山古城", image },
    { id: "id-2", name: "迪庆藏族自治州", province: "云南省", reason: "高原草甸" },
  ]);
  assert.deepEqual(asked, [{ kind: "named", keywords: "玉龙雪山", region: "丽江市" },
    { kind: "scenic", region: "迪庆藏族自治州" }]);
});
