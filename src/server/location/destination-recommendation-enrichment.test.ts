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
  assert.deepEqual(result, { matched: true, providerIdentity: "amap:real", imageUrl: "https://example.com/photo.jpg" });
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
    assert.deepEqual(await enricher.enrich(recommendation), { matched: true, providerIdentity: "amap:real", imageUrl: null });
  }
});

test("a unique scenic suffix match selects the first valid HTTPS photo, even without a title", async () => {
  process.env.AMAP_API_KEY = "fake-key";
  const enricher = new DestinationRecommendationEnricher(new AmapLocationProvider(async () => Response.json({
    status: "1", pois: [{ ...poi("meili", "云南省"), name: "梅里雪山风景区", photos: [
      { url: "http://example.test/insecure.jpg" }, { url: "broken" },
      { url: "https://example.test/first.jpg" }, { title: "Second", url: "https://example.test/second.jpg" },
    ] }],
  })));
  assert.deepEqual(await enricher.enrich({ name: "梅里雪山", region: "云南省", reason: "偏好雪山" }),
    { matched: true, providerIdentity: "amap:meili", imageUrl: "https://example.test/first.jpg" });
});

test("scenic matching cannot collapse a route, another peak, or a scenic area into a city", async () => {
  process.env.AMAP_API_KEY = "fake-key";
  for (const [name, providerName] of [["贡嘎环线", "贡嘎山风景区"], ["四姑娘山二峰", "四姑娘山景区"],
    ["黄山风景区", "黄山市"]]) {
    const enricher = new DestinationRecommendationEnricher(new AmapLocationProvider(async () => Response.json({
      status: "1", pois: [{ ...poi("different", "四川省"), name: providerName,
        photos: [{ url: "https://example.test/wrong.jpg" }] }],
    })));
    assert.deepEqual(await enricher.enrich({ name, region: null, reason: "Test" }), { matched: false, imageUrl: null });
  }
});

test("multiple equally plausible scenic POIs remain ambiguous regardless of photos", async () => {
  process.env.AMAP_API_KEY = "fake-key";
  const enricher = new DestinationRecommendationEnricher(new AmapLocationProvider(async () => Response.json({
    status: "1", pois: ["a", "b"].map((id) => ({ ...poi(id, "云南省"), name: "梅里雪山景区",
      photos: [{ url: `https://example.test/${id}.jpg` }] })),
  })));
  assert.deepEqual(await enricher.enrich({ name: "梅里雪山", region: "云南", reason: "Test" }), { matched: false, imageUrl: null });
});

test("two expressions reliably resolving to one POI expose the same ephemeral identity", async () => {
  process.env.AMAP_API_KEY = "fake-key";
  const enricher = new DestinationRecommendationEnricher(new AmapLocationProvider(async () => Response.json({
    status: "1", pois: [{ ...poi("dali", "云南省"), name: "大理市", photos: [] }],
  })));
  const first = await enricher.enrich({ name: "大理", region: "云南", reason: "First choice" });
  const second = await enricher.enrich({ name: "大理市", region: "云南", reason: "Alias" });
  assert.equal(first.matched, true);
  assert.equal(second.matched, true);
  assert.equal(first.providerIdentity, "amap:dali");
  assert.equal(second.providerIdentity, first.providerIdentity);
});
