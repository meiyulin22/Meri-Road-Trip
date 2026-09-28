import assert from "node:assert/strict";
import test from "node:test";

import { BochaOfficialAccessSearch, normalizeBochaAccessResponse } from "./bocha-official-access-search";

const page = {
  id: null, name: "Route closure notice", url: "https://example.gov.cn/access",
  displayUrl: "example.gov.cn/access", snippet: "Route closed",
  summary: "Route closed for repairs until further notice", siteName: "Authority",
  siteIcon: null, datePublished: null, dateLastCrawled: "2026-09-20T00:00:00Z",
};
const body = {
  code: 200, log_id: "log-1", msg: null,
  data: {
    _type: "SearchResponse", queryContext: { originalQuery: "query" },
    webPages: { webSearchUrl: "", totalEstimatedMatches: 2, value: [page, page], someResultsRemoved: true },
    images: { value: [{ contentUrl: "https://example.test/i.jpg", hostPageUrl: "https://example.test/p" }] },
    videos: null,
  },
};

test("reads data.webPages, ignores the image section, deduplicates URLs, and keeps metadata", () => {
  assert.deepEqual(normalizeBochaAccessResponse(body), [{
    title: "Route closure notice", url: "https://example.gov.cn/access", siteName: "Authority",
    snippet: "Route closed", summary: "Route closed for repairs until further notice",
    // Bocha labels dateLastCrawled with a Z but documents it as UTC+8 publish
    // time, so the corrected instant is eight hours before what it reads as.
    publishedAt: "2026-09-19T16:00:00.000Z", lastCrawledAt: "2026-09-19T16:00:00.000Z",
  }]);
  assert.deepEqual(normalizeBochaAccessResponse({ code: 200, data: { webPages: { value: [] } } }), []);
});

test("a real datePublished wins over the crawl date and is trusted as written", () => {
  const [result] = normalizeBochaAccessResponse({ code: 200, data: { webPages: { value: [
    { ...page, datePublished: "2026-09-18T02:00:00Z" },
  ] } } });
  assert.equal(result.publishedAt, "2026-09-18T02:00:00.000Z");
  assert.equal(result.lastCrawledAt, "2026-09-19T16:00:00.000Z");
});

test("makes one bounded web-search request without leaking the API key", async () => {
  let calls = 0;
  const search = new BochaOfficialAccessSearch({ apiKey: "secret-value", fetcher: async (url, init) => {
    calls++;
    assert.equal(url, "https://api.bocha.cn/v1/web-search");
    assert.equal(init?.method, "POST");
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer secret-value");
    // An access notice is judged on its text, so the fuller summary is requested.
    assert.deepEqual(JSON.parse(String(init?.body)), {
      query: "test query", freshness: "noLimit", summary: true, count: 8,
    });
    return new Response(JSON.stringify(body), { status: 200 });
  } });
  assert.equal((await search.search("test query")).length, 1);
  assert.equal(calls, 1);
});

test("rejects API, HTTP, malformed, and network failures with sanitized errors", async () => {
  const responses = [
    async () => new Response(JSON.stringify({ code: 403, msg: "You do not have enough money" }), { status: 200 }),
    async () => new Response("server secret-value", { status: 500 }),
    async () => new Response("not json", { status: 200 }),
    async () => { throw new Error("secret-value from network"); },
    // The previous adapter spoke the ai-search envelope, which has no data section.
    async () => new Response(JSON.stringify({ code: 200, messages: [] }), { status: 200 }),
  ];
  for (const fetcher of responses) {
    const search = new BochaOfficialAccessSearch({ apiKey: "secret-value", fetcher });
    await assert.rejects(search.search("query"), (error: Error) => {
      assert.doesNotMatch(error.message, /secret-value/);
      return true;
    });
  }
});

test("an empty key fails before any request reaches Bocha", async () => {
  let calls = 0;
  const search = new BochaOfficialAccessSearch({ apiKey: "", fetcher: async () => {
    calls += 1;
    throw new Error("Unexpected request");
  } });
  await assert.rejects(search.search("query"));
  assert.equal(calls, 0);
});
