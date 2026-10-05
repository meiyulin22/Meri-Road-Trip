import assert from "node:assert/strict";
import test from "node:test";

import type { LocationCandidate } from "@/domain/location/location";
import { DiscoverySearchError } from "@/platform/search/discovery-search";

import { createResolvePlaceTool, resolvePlaceAnswer } from "./resolve-place";
import { createWebSearchTool } from "./web-search";

const candidate = (name: string, kind?: "sight" | "other"): LocationCandidate => ({
  providerId: name, name, province: "云南省", city: "丽江市", district: "玉龙纳西族自治县", region: "云南省丽江市",
  address: null, longitude: 100.2, latitude: 27.1, coordinateSystem: "GCJ-02", ...(kind ? { kind } : {}),
});

// Mastra passes a second, runtime-provided argument; the tools here never read it.
const context = {} as never;

test("resolve-place hands the agent the provider's answer, never more than five candidates", async () => {
  assert.deepEqual(resolvePlaceAnswer({ status: "resolved", candidate: candidate("玉龙雪山", "sight") }).places[0],
    { name: "玉龙雪山", province: "云南省", city: "丽江市", district: "玉龙纳西族自治县", kind: "sight", longitude: 100.2, latitude: 27.1 });
  const many = resolvePlaceAnswer({ status: "ambiguous", candidates: Array.from({ length: 8 }, (_, index) => candidate(`苍山${index}`)) });
  assert.equal(many.status, "ambiguous");
  assert.equal(many.places.length, 5);
  assert.equal(many.places[0].kind, "unknown");
  assert.deepEqual(resolvePlaceAnswer({ status: "area", province: "海南省" }), { status: "area", province: "海南省", places: [] });
  assert.deepEqual(resolvePlaceAnswer({ status: "not_ready", reason: "destination_missing" }), { status: "unresolved", province: null, places: [] });

  const seen: string[] = [];
  const tool = createResolvePlaceTool(async (name) => { seen.push(name); return { status: "provider_error" }; });
  assert.deepEqual(await tool.execute?.({ name: "丽江" }, context), { status: "provider_error", province: null, places: [] });
  assert.deepEqual(seen, ["丽江"]);
});

test("web-search returns at most five dated leads, and a failing provider is only 'unavailable'", async () => {
  const tool = createWebSearchTool({ async search() {
    return Array.from({ length: 7 }, (_, index) => ({ source: "s", title: `t${index}`, url: `https://example.com/${index}`,
      ...(index === 0 ? { snippet: "雨崩临时闭园", publishedAt: "2025-02-24" } : {}) }));
  } });
  const found = await tool.execute?.({ query: "雨崩 闭园" }, context) as { status: string; results: { snippet: string | null; publishedAt: string | null }[] };
  assert.equal(found.status, "ok");
  assert.equal(found.results.length, 5);
  assert.deepEqual([found.results[0].publishedAt, found.results[1].publishedAt], ["2025-02-24", null]);

  const failing = createWebSearchTool({ async search() { throw new DiscoverySearchError("http"); } });
  assert.deepEqual(await failing.execute?.({ query: "雨崩" }, context), { status: "unavailable", results: [] });
});
