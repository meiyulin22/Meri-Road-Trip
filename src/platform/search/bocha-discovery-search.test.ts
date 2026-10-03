import assert from "node:assert/strict";
import test from "node:test";

import { DiscoverySearchError } from "@/platform/search/discovery-search";
import { BochaDiscoverySearch, normalizeBochaDiscoveryResponse } from "./bocha-discovery-search";

const page = (index: number) => ({
  id: null, name: `Trail story ${index}`, url: `https://example.test/story/${index}`,
  displayUrl: `example.test/story/${index}`, snippet: `Short note ${index}`,
  summary: `Fuller travel writing about route ${index}`, siteName: `Publisher ${index}`,
  siteIcon: null, datePublished: null, dateLastCrawled: "2026-09-20T08:00:00Z",
  cachedPageUrl: null, language: "zh_chs", isFamilyFriendly: true, isNavigational: false,
});
const body = (value: unknown[]) => ({
  code: 200, log_id: "log-1", msg: null,
  data: {
    _type: "SearchResponse", queryContext: { originalQuery: "query" },
    webPages: { webSearchUrl: "", totalEstimatedMatches: 100, value, someResultsRemoved: true },
    images: { value: [] }, videos: null,
  },
});

test("one documented web-search request that asks for the fuller page text", async () => {
  const requests: unknown[] = [];
  const search = new BochaDiscoverySearch({ apiKey: "secret-token", fetcher: async (url, init) => {
    assert.equal(url, "https://api.bocha.cn/v1/web-search");
    assert.equal(init?.method, "POST");
    assert.equal(init?.redirect, "error");
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer secret-token");
    requests.push(JSON.parse(String(init?.body)));
    return Response.json(body([page(1)]));
  } });
  const results = await search.search("秋季 高山 徒步 成熟路线");
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0], {
    query: "秋季 高山 徒步 成熟路线", freshness: "noLimit", summary: true, count: 8,
  });
  assert.deepEqual(results, [{
    source: "Publisher 1", title: "Trail story 1", url: "https://example.test/story/1",
    // summary wins over snippet, because that is the text a candidate can be
    // inspired by, and the crawl date is corrected from its mislabelled Z.
    snippet: "Fuller travel writing about route 1",
    publishedAt: "2026-09-20T00:00:00.000Z",
  }]);
});

test("normalizes only documented fields, bounds results, and skips unusable entries", () => {
  const value = [
    { ...page(0), url: "javascript:alert(1)" },
    { ...page(0), name: "  " },
    ...Array.from({ length: 12 }, (_, index) => page(index + 1)),
    page(1),
  ];
  const normalized = normalizeBochaDiscoveryResponse(body(value));
  assert.equal(normalized.length, 8);
  assert.equal(normalized[0].title, "Trail story 1");
  assert.equal(normalized[7].title, "Trail story 8");
  assert.deepEqual(Object.keys(normalized[0]).sort(), ["publishedAt", "snippet", "source", "title", "url"]);
  assert.deepEqual(normalizeBochaDiscoveryResponse(body([])), []);
});

test("a page with no summary still contributes its snippet, and a site with no name its host", () => {
  const [result] = normalizeBochaDiscoveryResponse(body([
    { ...page(3), summary: null, siteName: null, dateLastCrawled: null },
  ]));
  assert.deepEqual(result, {
    source: "example.test", title: "Trail story 3", url: "https://example.test/story/3",
    snippet: "Short note 3",
  });
});

test("every failure becomes a DiscoverySearchError kind without exposing the key", async () => {
  for (const [fetcher, kind] of [
    [async () => new Response("unavailable", { status: 503 }), "http"],
    [async () => Response.json({ code: 403, msg: "key secret-token has no money" }), "api"],
    [async () => Response.json({ code: 200, data: { webPages: { value: "pages" } } }), "invalid_response"],
    // The ai-search envelope this adapter's siblings used to speak.
    [async () => Response.json({ code: 200, messages: [] }), "invalid_response"],
    [async () => new Response("not json", { status: 200 }), "invalid_response"],
    [async () => { throw new Error("connect failed for secret-token"); }, "network"],
    [async () => { const error = new Error("secret-token"); error.name = "TimeoutError"; throw error; }, "timeout"],
  ] as const) {
    const search = new BochaDiscoverySearch({ apiKey: "secret-token", fetcher });
    await assert.rejects(search.search("徒步"), (error: unknown) =>
      error instanceof DiscoverySearchError && error.kind === kind
      && !error.message.includes("secret-token"));
  }
});

test("a missing key makes no HTTP request", async () => {
  let calls = 0;
  const search = new BochaDiscoverySearch({ apiKey: "", fetcher: async () => {
    calls += 1;
    throw new Error("Unexpected request");
  } });
  await assert.rejects(search.search("徒步"), (error: unknown) =>
    error instanceof DiscoverySearchError && error.kind === "configuration");
  assert.equal(calls, 0);
});
