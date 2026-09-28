import assert from "node:assert/strict";
import test from "node:test";

import type { RankedDestinationCandidate } from "@/server/ai/destination-candidate-ranker";
import { AmapLocationProvider } from "@/platform/location-provider/amap-location-provider";
import { DestinationRecommendationEnricher } from "./destination-recommendation-enrichment";
import { buildDestinationImageQuery, enrichRankedTopThree, usableBochaImageUrl } from "./enrich-ranked-destinations";

const image = { contentUrl: "https://images.example.test/mountain.jpg", hostPageUrl: "https://source.example.test/page",
  width: 1200, height: 800 };
const ranked = (id: string, name: string): RankedDestinationCandidate => ({
  candidate: { id, name, region: "四川", preferenceRationale: "Matches the Journey." },
  reason: `你偏好高山徒步，${name}是当前探索方向。`, evidence: [],
});

test("Amap image wins and prevents Bocha lookup", async () => {
  const input = ranked("id-1", "示例线");
  let imageCalls = 0;
  const result = await enrichRankedTopThree([input], {
    amap: { async enrich() { return { matched: true, imageUrl: "https://amap.example.test/photo.jpg" }; } },
    images: { async search() { imageCalls++; return [image]; } },
  });
  assert.equal(result.destinations[0].imageUrl, "https://amap.example.test/photo.jpg");
  assert.equal(imageCalls, 0);
  assert.equal(result.destinations[0].candidate, input.candidate);
  assert.equal(result.destinations[0].reason, input.reason);
});

test("Amap match without photo and Amap failure both try one Bocha fallback", async () => {
  for (const amap of [
    { async enrich() { return { matched: true, imageUrl: null }; } },
    { async enrich(): Promise<never> { throw new Error("secret Amap key"); } },
    { async enrich() { return { matched: true, imageUrl: "http://amap.example.test/photo.jpg" }; } },
  ]) {
    let calls = 0;
    const result = await enrichRankedTopThree([ranked("id-1", "示例线")], {
      amap, images: { async search(query) { calls++; assert.equal(query, "示例线 四川"); return [image]; } },
    });
    assert.equal(result.destinations[0].imageUrl, image.contentUrl);
    assert.equal(calls, 1);
  }
});

test("first usable Bocha image is selected; invalid URLs, tiny images, and obvious icons are rejected", async () => {
  const bad = [
    { ...image, contentUrl: "http://images.example.test/photo.jpg" },
    { ...image, contentUrl: "https://images.example.test/logo.png" },
    { ...image, hostPageUrl: "javascript:alert(1)" },
    { ...image, width: 32 },
    { ...image, height: 40 },
  ];
  for (const item of bad) assert.equal(usableBochaImageUrl(item), null);
  const result = await enrichRankedTopThree([ranked("id-1", "示例线")], {
    amap: { async enrich() { return { matched: false, imageUrl: null }; } },
    images: { async search() { return [...bad, image]; } },
  });
  assert.equal(result.destinations[0].imageUrl, image.contentUrl);
  assert.equal(usableBochaImageUrl({ ...image, hostPageUrl: "http://source.example.test/page" }), image.contentUrl);
});

test("both providers failing leaves null for the existing local card fallback", async () => {
  const result = await enrichRankedTopThree([ranked("id-1", "示例线")], {
    amap: { async enrich(): Promise<never> { throw new Error("secret Amap key"); } },
    images: { async search(): Promise<never> { throw new Error("secret Bocha key"); } },
  });
  assert.equal(result.destinations[0].imageUrl, null);
  assert.doesNotMatch(JSON.stringify(result), /secret/);
});

test("route-like candidate survives when Amap resolves no exact POI", async () => {
  const priorKey = process.env.AMAP_API_KEY;
  process.env.AMAP_API_KEY = "fake-key";
  try {
    const input = ranked("route-id", "贡嘎环线");
    const fetcher: typeof fetch = async () => Response.json({ status: "1", pois: [{
      id: "different", name: "贡嘎山", pname: "四川省", cityname: "甘孜州", adname: "康定市",
      location: "101.00,29.00", address: "景区", photos: [{ title: "Wrong POI", url: "https://amap.example.test/wrong.jpg" }],
    }] });
    const result = await enrichRankedTopThree([input], {
      amap: new DestinationRecommendationEnricher(new AmapLocationProvider(fetcher)),
      images: { async search(query) { assert.equal(query, "贡嘎环线 四川"); return [image]; } },
    });
    assert.equal(result.destinations[0].candidate, input.candidate);
    assert.equal(result.destinations[0].candidate.name, "贡嘎环线");
    assert.equal(result.destinations[0].imageUrl, image.contentUrl);
  } finally {
    if (priorKey === undefined) delete process.env.AMAP_API_KEY;
    else process.env.AMAP_API_KEY = priorKey;
  }
});

test("preserves rank order, names, regions, reasons, and IDs with at most three parallel enrichments", async () => {
  const input = [ranked("c", "丙线"), ranked("a", "甲线"), ranked("b", "乙线")];
  let active = 0;
  let maxActive = 0;
  let amapCalls = 0;
  let imageCalls = 0;
  const dependencies = {
    amap: { async enrich() { amapCalls++; active++; maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5)); active--; return { matched: false, imageUrl: null }; } },
    images: { async search() { imageCalls++; return []; } },
  };
  const result = await enrichRankedTopThree(input, dependencies);
  assert.deepEqual(result.destinations.map(({ candidate }) => candidate.id), ["c", "a", "b"]);
  assert.deepEqual(result.destinations.map(({ candidate }) => candidate.name), input.map(({ candidate }) => candidate.name));
  assert.deepEqual(result.destinations.map(({ candidate }) => candidate.region), input.map(({ candidate }) => candidate.region));
  assert.deepEqual(result.destinations.map(({ reason }) => reason), input.map(({ reason }) => reason));
  assert.deepEqual(result.destinations.map(({ imageUrl }) => imageUrl), [null, null, null]);
  assert.equal(maxActive, 3);
  assert.equal(amapCalls, 3);
  assert.equal(imageCalls, 3);
  await assert.rejects(enrichRankedTopThree([...input, ranked("d", "丁线")], dependencies), RangeError);
  assert.equal(amapCalls, 3);
});

test("zero, one, and two candidates remain representable without inventing replacements", async () => {
  const dependencies = {
    amap: { async enrich() { return { matched: false, imageUrl: null }; } },
    images: { async search() { return []; } },
  };
  for (const count of [0, 1, 2]) {
    const input = [ranked("a", "甲线"), ranked("b", "乙线")].slice(0, count);
    const result = await enrichRankedTopThree(input, dependencies);
    assert.equal(result.destinations.length, count);
  }
  assert.equal(buildDestinationImageQuery({ ...ranked("a", "甲线").candidate, region: null }), "甲线");
});
