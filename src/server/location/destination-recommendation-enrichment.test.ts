import assert from "node:assert/strict";
import test from "node:test";

import { AmapLocationProvider } from "@/infrastructure/location/amap-location-provider";
import { DestinationRecommendationEnricher } from "./destination-recommendation-enrichment";

const originalKey = process.env.AMAP_API_KEY;
test.afterEach(() => {
  if (originalKey === undefined) delete process.env.AMAP_API_KEY;
  else process.env.AMAP_API_KEY = originalKey;
});

const recommendation = { name: "香格里拉", region: "云南", reason: "适合探索" };
const poi = (id: string, pname: string) => ({
  id, name: "香格里拉市", pname, cityname: "迪庆藏族自治州", adname: "香格里拉市",
  location: "99.70,27.82", address: "建塘镇",
});

test("matches a real region-qualified POI before requesting its photos by verified ID", async () => {
  process.env.AMAP_API_KEY = "secret-test-key";
  const paths: string[] = [];
  const fetcher: typeof fetch = async (input) => {
    const url = new URL(String(input));
    paths.push(url.pathname);
    if (url.pathname.endsWith("/text")) return Response.json({ status: "1", pois: [poi("wrong", "四川省"), poi("real", "云南省")] });
    assert.equal(url.searchParams.get("id"), "real");
    assert.equal(url.searchParams.get("show_fields"), "photos");
    return Response.json({ status: "1", pois: [{ id: "real", photos: [{ title: "Photo", url: "https://example.com/photo.jpg" }] }] });
  };
  const result = await new DestinationRecommendationEnricher(new AmapLocationProvider(fetcher), fetcher).enrich(recommendation);
  assert.deepEqual(result, { matched: true, imageUrl: "https://example.com/photo.jpg" });
  assert.deepEqual(paths, ["/v5/place/text", "/v5/place/detail"]);
  assert.equal(JSON.stringify(result).includes("secret-test-key"), false);
});

test("ambiguous or unmatched recommendations never fetch a photo", async () => {
  process.env.AMAP_API_KEY = "secret-test-key";
  let details = 0;
  const fetcher: typeof fetch = async (input) => {
    if (new URL(String(input)).pathname.endsWith("/detail")) { details += 1; throw new Error("unexpected detail"); }
    return Response.json({ status: "1", pois: [poi("one", "云南省"), poi("two", "云南省")] });
  };
  const enricher = new DestinationRecommendationEnricher(new AmapLocationProvider(fetcher), fetcher);
  assert.deepEqual(await enricher.enrich(recommendation), { matched: false, imageUrl: null });
  assert.deepEqual(await enricher.enrich({ ...recommendation, region: "四川" }), { matched: false, imageUrl: null });
  assert.equal(details, 0);
});

test("missing photos and detail provider failures degrade to nullable media", async () => {
  process.env.AMAP_API_KEY = "secret-test-key";
  let detailFails = false;
  const fetcher: typeof fetch = async (input) => {
    if (new URL(String(input)).pathname.endsWith("/text")) return Response.json({ status: "1", pois: [poi("real", "云南省")] });
    if (detailFails) throw new Error("secret-test-key must not be logged");
    return Response.json({ status: "1", pois: [{ id: "real", photos: [] }] });
  };
  const enricher = new DestinationRecommendationEnricher(new AmapLocationProvider(fetcher), fetcher);
  assert.deepEqual(await enricher.enrich(recommendation), { matched: true, imageUrl: null });
  detailFails = true;
  assert.deepEqual(await enricher.enrich(recommendation), { matched: true, imageUrl: null });
});
