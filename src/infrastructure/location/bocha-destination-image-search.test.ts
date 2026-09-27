import assert from "node:assert/strict";
import test from "node:test";

import { BochaDestinationImageSearch, normalizeBochaImageResponse } from "./bocha-destination-image-search";

const image = { contentUrl: "https://images.example.test/mountain.jpg", hostPageUrl: "https://source.example.test/page",
  width: 1200, height: 800, thumbnailUrl: "https://images.example.test/thumb.jpg", name: "Mountain" };
const body = { code: 200, messages: [
  { type: "source", content_type: "webpage", content: JSON.stringify({ value: [{ name: "Ignored" }] }) },
  { type: "source", content_type: "image", content: JSON.stringify({ value: [image, image] }) },
] };

test("normalizes only source/image results and only documented image fields", () => {
  assert.deepEqual(normalizeBochaImageResponse(body), [{
    contentUrl: image.contentUrl, hostPageUrl: image.hostPageUrl, width: 1200, height: 800,
  }]);
  assert.deepEqual(normalizeBochaImageResponse({ code: 200, messages: [] }), []);
  assert.deepEqual(normalizeBochaImageResponse({ code: 200, messages: [{
    type: "source", content_type: "image", content: { value: [{ contentUrl: image.contentUrl, hostPageUrl: image.hostPageUrl }] },
  }] }), [{ contentUrl: image.contentUrl, hostPageUrl: image.hostPageUrl }]);
  assert.deepEqual(normalizeBochaImageResponse({ code: 200, messages: [{
    type: "source", content_type: "image", content: { value: [{ ...image, width: 0 }] },
  }] }), []);
});

test("makes one bounded request with deterministic query and no answer or streaming", async () => {
  let calls = 0;
  const search = new BochaDestinationImageSearch({ apiKey: "secret-key", fetcher: async (url, init) => {
    calls++;
    assert.equal(url, "https://api.bocha.cn/v1/ai-search");
    assert.equal(init?.method, "POST");
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer secret-key");
    assert.deepEqual(JSON.parse(String(init?.body)), {
      query: "贡嘎环线 四川", answer: false, stream: false, count: 8, freshness: "noLimit",
    });
    return Response.json(body);
  } });
  assert.equal((await search.search("贡嘎环线 四川")).length, 1);
  assert.equal(calls, 1);
});

test("API, HTTP, malformed, and network failures expose sanitized errors", async () => {
  const fetchers: (typeof fetch)[] = [
    async () => Response.json({ code: 500, messages: [] }),
    async () => new Response("secret-key", { status: 500 }),
    async () => new Response("not JSON", { status: 200 }),
    async () => { throw new Error("secret-key network failure"); },
  ];
  for (const fetcher of fetchers) await assert.rejects(
    new BochaDestinationImageSearch({ apiKey: "secret-key", fetcher }).search("query"),
    (error: Error) => { assert.doesNotMatch(error.message, /secret-key/); return true; },
  );
  assert.throws(() => normalizeBochaImageResponse({ code: 200, messages: [{
    type: "source", content_type: "image", content: "{invalid",
  }] }));
});
