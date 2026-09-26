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

test("matched POI uses its HTTPS Text Search photo without a Detail request", async () => {
  process.env.AMAP_API_KEY = "secret-test-key";
  const paths: string[] = [];
  const fetcher: typeof fetch = async (input) => {
    const url = new URL(String(input));
    paths.push(url.pathname);
    assert.equal(url.searchParams.get("show_fields"), "photos");
    return Response.json({ status: "1", pois: [
      { ...poi("wrong", "四川省"), photos: [{ title: "wrong", url: "https://example.com/wrong.jpg" }] },
      { ...poi("real", "云南省"), photos: [
        { title: "HTTP", url: "http://example.com/older.jpg" },
        { title: "Photo", url: "https://example.com/photo.jpg" },
      ] },
    ] });
  };
  const result = await new DestinationRecommendationEnricher(new AmapLocationProvider(fetcher)).enrich(recommendation);
  assert.deepEqual(result, { matched: true, imageUrl: "https://example.com/photo.jpg" });
  assert.deepEqual(paths, ["/v5/place/text"]);
  assert.equal(JSON.stringify(result).includes("secret-test-key"), false);
});

test("ambiguous or unmatched POIs do not use any search photo", async () => {
  process.env.AMAP_API_KEY = "secret-test-key";
  let searches = 0;
  const fetcher: typeof fetch = async (input) => {
    assert.equal(new URL(String(input)).pathname, "/v5/place/text");
    searches += 1;
    return Response.json({ status: "1", pois: [
      { ...poi("one", "云南省"), photos: [{ title: "one", url: "https://example.com/one.jpg" }] },
      { ...poi("two", "云南省"), photos: [{ title: "two", url: "https://example.com/two.jpg" }] },
    ] });
  };
  const enricher = new DestinationRecommendationEnricher(new AmapLocationProvider(fetcher));
  assert.deepEqual(await enricher.enrich(recommendation), { matched: false, imageUrl: null });
  assert.deepEqual(await enricher.enrich({ ...recommendation, region: "四川" }), { matched: false, imageUrl: null });
  assert.equal(searches, 2);
});

test("matched POI without a usable HTTPS photo keeps the default-image fallback", async () => {
  process.env.AMAP_API_KEY = "secret-test-key";
  for (const photos of [undefined, [], [{ title: "http", url: "http://example.com/photo.jpg" }],
    [{ title: "invalid", url: "not-a-url" }]]) {
    const fetcher: typeof fetch = async (input) => {
      assert.equal(new URL(String(input)).pathname, "/v5/place/text");
      return Response.json({ status: "1", pois: [{ ...poi("real", "云南省"), ...(photos ? { photos } : {}) }] });
    };
    const enricher = new DestinationRecommendationEnricher(new AmapLocationProvider(fetcher));
    assert.deepEqual(await enricher.enrich(recommendation), { matched: true, imageUrl: null });
  }
});
