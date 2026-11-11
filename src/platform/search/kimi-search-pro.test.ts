import assert from "node:assert/strict";
import test from "node:test";

import { DiscoverySearchError } from "./discovery-search";
import { KimiSearchPro } from "./kimi-search-pro";

const page = {
  title: "景区公告",
  url: "https://example.test/notice",
  site_name: "景区官网",
  date: "2026-11-11",
  snippet: "搜索摘要",
  chunks: [{ text: "景区开放公告正文", score: 0.8 }],
};

test("uses the configured Moonshot endpoint and returns bounded source evidence", async () => {
  let requests = 0;
  const search = new KimiSearchPro({
    apiKey: "test-token",
    baseUrl: "https://kimi.example.test/v1/",
    fetcher: async (url, init) => {
      requests += 1;
      assert.equal(url, "https://kimi.example.test/v1/tools/search_pro");
      assert.equal(init?.method, "POST");
      assert.equal(init?.redirect, "error");
      assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer test-token");
      assert.deepEqual(JSON.parse(String(init?.body)), {
        text_query: "丽江 景点", limit: 5, timeout_seconds: 10,
      });
      return Response.json({ search_results: [
        page,
        { ...page, title: "重复公告" },
        { ...page, url: "javascript:alert(1)" },
        { ...page, title: "", url: "https://example.test/invalid" },
        ...Array.from({ length: 6 }, (_, index) => ({
          title: "长".repeat(200),
          url: "https://example.test/other/" + index,
          snippet: "摘要".repeat(300),
        })),
      ] });
    },
  });

  const results = await search.search(" 丽江\n 景点 ");
  assert.equal(requests, 1);
  assert.equal(results.length, 5);
  assert.deepEqual(results[0], {
    source: "景区官网",
    title: "景区公告",
    url: "https://example.test/notice",
    snippet: "景区开放公告正文",
    publishedAt: "2026-11-11",
  });
  assert.equal(results[1].source, "example.test");
  assert.equal(results[1].title.length, 160);
  assert.equal(results[1].snippet?.length, 560);
  assert.equal(results[1].publishedAt, undefined);
});

test("distinguishes empty search results from unavailable or malformed responses", async () => {
  const empty = new KimiSearchPro({
    apiKey: "test-token",
    fetcher: async () => Response.json({ search_results: [] }),
  });
  assert.deepEqual(await empty.search("丽江"), []);

  for (const [fetcher, kind] of [
    [async () => new Response("Bearer test-token", { status: 403 }), "http"],
    [async () => new Response(null, { status: 504 }), "timeout"],
    [async () => Response.json({ search_results: "not an array" }), "invalid_response"],
    [async () => new Response("not json"), "invalid_response"],
    [async () => { throw new Error("Failed using test-token"); }, "network"],
  ] as const) {
    const search = new KimiSearchPro({ apiKey: "test-token", fetcher });
    await assert.rejects(search.search("丽江"), (error) =>
      error instanceof DiscoverySearchError && error.kind === kind && !error.message.includes("test-token"));
  }
});

test("requires a key and does not start a request with a cancelled signal", async () => {
  let requests = 0;
  const fetcher = async () => {
    requests += 1;
    return Response.json({ search_results: [] });
  };
  await assert.rejects(new KimiSearchPro({ apiKey: "", fetcher }).search("丽江"),
    (error) => error instanceof DiscoverySearchError && error.kind === "configuration");
  await assert.rejects(new KimiSearchPro({ apiKey: "test-token", fetcher }).search("丽江", AbortSignal.abort()),
    (error) => error instanceof DiscoverySearchError && error.kind === "network");
  assert.equal(requests, 0);
});
