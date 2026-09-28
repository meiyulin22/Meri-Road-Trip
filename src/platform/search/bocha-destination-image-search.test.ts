import assert from "node:assert/strict";
import test from "node:test";

import { BochaDestinationImageSearch, normalizeBochaImageResponse } from "./bocha-destination-image-search";

const image = {
  webSearchUrl: "", name: "Mountain", thumbnailUrl: "https://images.example.test/thumb.jpg",
  datePublished: null, contentUrl: "https://images.example.test/mountain.jpg",
  hostPageUrl: "https://source.example.test/page", contentSize: "120 B",
  encodingFormat: "jpeg", hostPageDisplayUrl: "source.example.test/page",
  width: 1200, height: 800, thumbnail: { width: 400, height: 300 },
};
const body = {
  code: 200, log_id: "log-1", msg: null,
  data: {
    _type: "SearchResponse", queryContext: { originalQuery: "贡嘎环线 四川" },
    webPages: { value: [{ name: "Ignored", url: "https://example.test/ignored" }] },
    images: { value: [image, image] },
    videos: null,
  },
};

test("reads data.images, ignores the web-page section, and keeps only documented fields", () => {
  assert.deepEqual(normalizeBochaImageResponse(body), [{
    contentUrl: image.contentUrl, hostPageUrl: image.hostPageUrl, width: 1200, height: 800,
  }]);
  assert.deepEqual(normalizeBochaImageResponse({ code: 200, data: { images: { value: [] } } }), []);
  // A query that matched no images at all leaves the card on its local fallback.
  assert.deepEqual(normalizeBochaImageResponse({ code: 200, data: { webPages: { value: [] } } }), []);
  assert.deepEqual(normalizeBochaImageResponse({ code: 200, data: { images: { value: [
    { contentUrl: image.contentUrl, hostPageUrl: image.hostPageUrl },
  ] } } }), [{ contentUrl: image.contentUrl, hostPageUrl: image.hostPageUrl }]);
  assert.deepEqual(normalizeBochaImageResponse({ code: 200, data: { images: { value: [
    { ...image, width: 0 },
  ] } } }), []);
});

test("makes one bounded request that does not pay for page text it never reads", async () => {
  let calls = 0;
  const search = new BochaDestinationImageSearch({ apiKey: "secret-key", fetcher: async (url, init) => {
    calls++;
    assert.equal(url, "https://api.bocha.cn/v1/web-search");
    assert.equal(init?.method, "POST");
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer secret-key");
    assert.deepEqual(JSON.parse(String(init?.body)), {
      query: "贡嘎环线 四川", freshness: "noLimit", summary: false, count: 8,
    });
    return Response.json(body);
  } });
  assert.equal((await search.search("贡嘎环线 四川")).length, 1);
  assert.equal(calls, 1);
});

test("API, HTTP, malformed, and network failures expose sanitized errors", async () => {
  const fetchers: (typeof fetch)[] = [
    async () => Response.json({ code: 403, msg: "You do not have enough money" }),
    async () => new Response("secret-key", { status: 500 }),
    async () => new Response("not JSON", { status: 200 }),
    async () => { throw new Error("secret-key network failure"); },
    // The previous adapter spoke the ai-search envelope, which has no data section.
    async () => Response.json({ code: 200, messages: [] }),
  ];
  for (const fetcher of fetchers) await assert.rejects(
    new BochaDestinationImageSearch({ apiKey: "secret-key", fetcher }).search("query"),
    (error: Error) => { assert.doesNotMatch(error.message, /secret-key/); return true; },
  );
});

test("an empty key fails before any request reaches Bocha", async () => {
  let calls = 0;
  await assert.rejects(new BochaDestinationImageSearch({ apiKey: "", fetcher: async () => {
    calls += 1;
    throw new Error("Unexpected request");
  } }).search("query"));
  assert.equal(calls, 0);
});
