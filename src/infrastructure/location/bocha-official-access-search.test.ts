import assert from "node:assert/strict";
import test from "node:test";

import { BochaOfficialAccessSearch, normalizeBochaAccessResponse } from "./bocha-official-access-search";

const page = { name: "Route closure notice", url: "https://example.gov.cn/access", siteName: "Authority",
  snippet: "Route closed", datePublished: "2026-09-20" };
const body = { code: 200, messages: [
  { type: "source", content_type: "webpage", content: JSON.stringify({ value: [page, page] }) },
  { type: "source", content_type: "image", content: JSON.stringify({ value: [{ url: "https://example.test/image" }] }) },
] };

test("normalizes webpage sources only, deduplicates URLs, and preserves metadata", () => {
  assert.deepEqual(normalizeBochaAccessResponse(body), [{
    title: "Route closure notice", url: "https://example.gov.cn/access", siteName: "Authority",
    snippet: "Route closed", publishedAt: "2026-09-20T00:00:00.000Z",
  }]);
  assert.deepEqual(normalizeBochaAccessResponse({ code: 200, messages: [] }), []);
});

test("makes one bounded server-side request without leaking the API key", async () => {
  let calls = 0;
  const search = new BochaOfficialAccessSearch({ apiKey: "secret-value", fetcher: async (url, init) => {
    calls++;
    assert.equal(url, "https://api.bocha.cn/v1/ai-search");
    assert.equal(init?.method, "POST");
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer secret-value");
    assert.deepEqual(JSON.parse(String(init?.body)), {
      query: "test query", answer: false, stream: false, count: 8, freshness: "oneYear",
    });
    return new Response(JSON.stringify(body), { status: 200 });
  } });
  assert.equal((await search.search("test query")).length, 1);
  assert.equal(calls, 1);
});

test("rejects API, HTTP, malformed, and network failures with sanitized errors", async () => {
  const responses = [
    async () => new Response(JSON.stringify({ code: 500, messages: [] }), { status: 200 }),
    async () => new Response("server secret-value", { status: 500 }),
    async () => new Response("not json", { status: 200 }),
    async () => { throw new Error("secret-value from network"); },
  ];
  for (const fetcher of responses) {
    const search = new BochaOfficialAccessSearch({ apiKey: "secret-value", fetcher });
    await assert.rejects(search.search("query"), (error: Error) => {
      assert.doesNotMatch(error.message, /secret-value/);
      return true;
    });
  }
  assert.throws(() => normalizeBochaAccessResponse({ code: 200, messages: [{
    type: "source", content_type: "webpage", content: "{bad json",
  }] }));
});
