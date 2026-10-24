import assert from "node:assert/strict";
import test from "node:test";

import type { StructuredOutputModelClient } from "@/platform/llm/kimi-client";

import { createRegionHintClient, hintedAreas, provincesOfPlace, readPlace, type RegionHintClient } from "./region-hint";

/** A model that answers with fixed JSON and counts how often it was asked. */
function model(content: string | null, fail = false): StructuredOutputModelClient & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async generateStructuredOutput(request) {
      calls.push(request.userMessage ?? "");
      if (fail) throw new Error("provider down");
      return { content, model: "kimi-k2.6", finishReason: "stop" };
    },
  };
}

test("the prefecture comes before its province, because it narrows a search far better", async () => {
  const client = createRegionHintClient(model(JSON.stringify({ province: "云南省", prefecture: "大理白族自治州" })));
  assert.deepEqual(await hintedAreas("苍山", client), ["大理白族自治州", "云南省"]);
});

test("a name that already carries its administrative level is not sent to the model", async () => {
  const fake = model(JSON.stringify({ province: "云南省", prefecture: "丽江市" }));
  const client = createRegionHintClient(fake);
  assert.deepEqual(await hintedAreas("丽江市", client), []);
  assert.deepEqual(await hintedAreas("云南", client), []);
  assert.deepEqual(fake.calls, []);
});

test("an unknown place, a blank answer and a broken model all leave the search as it was", async () => {
  const unknown = createRegionHintClient(model(JSON.stringify({ province: null, prefecture: null })));
  assert.deepEqual(await hintedAreas("火星基地", unknown), []);
  assert.deepEqual(await hintedAreas("火星基地", unknown), []);
  const blank = createRegionHintClient(model(""));
  assert.deepEqual(await hintedAreas("涠洲岛", blank), []);
  const broken = createRegionHintClient(model(null, true));
  assert.deepEqual(await hintedAreas("涠洲岛", broken), []);
});

test("a real answer is asked once and remembered; a miss is not remembered", async () => {
  const fake = model(JSON.stringify({ province: "广西壮族自治区", prefecture: "北海市" }));
  const client = createRegionHintClient(fake);
  assert.deepEqual(await hintedAreas("涠洲岛", client), ["北海市", "广西壮族自治区"]);
  assert.deepEqual(await hintedAreas("涠洲岛", client), ["北海市", "广西壮族自治区"]);
  assert.equal(fake.calls.length, 1);
  const missing: RegionHintClient = { hint: async () => null };
  assert.deepEqual(await hintedAreas("不存在的地方", missing), []);
  assert.deepEqual(await hintedAreas("不存在的地方", missing), []);
});

test("a model that never answers is no hint at all", async () => {
  const slow: RegionHintClient = { hint: () => new Promise(() => undefined) };
  const started = Date.now();
  assert.deepEqual(await hintedAreas("苍山", slow, 20), []);
  assert.ok(Date.now() - started < 1_000);
});

test("the model reads a group of provinces, and only real province names are kept from its answer", async () => {
  const client = createRegionHintClient(model(JSON.stringify({ kind: "province_group",
    provinces: ["江苏省", "浙江省", "上海市", "江南省"], province: null, prefecture: null, officialName: null })));
  assert.deepEqual(await provincesOfPlace("苏浙沪一带", client), ["江苏省", "浙江省", "上海市"]);
  // A province group is no search centre.
  assert.deepEqual(await hintedAreas("苏浙沪一带", client), []);
});

test("when the model answers, its reading stands even against the nickname table", async () => {
  const client = createRegionHintClient(model(JSON.stringify({ kind: "sight", provinces: [], province: "浙江省",
    prefecture: "杭州市", officialName: null })));
  assert.equal(await provincesOfPlace("京津", client), null);
});

test("when the model cannot answer, the nickname table still keeps 江浙沪 off the map", async () => {
  const broken = createRegionHintClient(model(null, true));
  assert.deepEqual(await provincesOfPlace("江浙沪", broken), ["江苏省", "浙江省", "上海市"]);
  const silent: RegionHintClient = { hint: () => new Promise(() => undefined) };
  assert.deepEqual(await provincesOfPlace("川渝", silent, 20), ["四川省", "重庆市"]);
});

test("the reading carries the map's official name for a sight", async () => {
  const client = createRegionHintClient(model(JSON.stringify({ kind: "sight", provinces: [], province: "云南省",
    prefecture: "大理白族自治州", officialName: "点苍山" })));
  assert.equal((await readPlace("苍山山脉", client))?.officialName, "点苍山");
});
