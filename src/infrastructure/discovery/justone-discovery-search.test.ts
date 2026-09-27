import assert from "node:assert/strict";
import test from "node:test";

import { DiscoverySearchError } from "@/server/discovery/discovery-search";
import { JustOneDiscoverySearch, normalizeJustOneSearchResponse } from "./justone-discovery-search";

const token = "test-secret-token";
const fixedNow = new Date("2026-09-27T08:00:00.000Z");
const item = (index: number) => ({
  sourceName: `Publisher ${index}`, title: `Trail story ${index}`,
  url: `https://example.test/story/${index}`,
  content: `<p>Fresh <strong>travel idea ${index}</strong></p>`,
  createTime: 1784563200000,
});
const response = (list: unknown[]) => ({ code: 0, message: null, data: { nextCursor: "unused", totalNumber: 100, list }, recordTime: null });

test("uses one documented cross-platform request with URL token and a 30-day Shanghai time range", async () => {
  const requests: URL[] = [];
  const search = new JustOneDiscoverySearch({ token, now: () => fixedNow, fetcher: async (input, init) => {
    requests.push(new URL(String(input)));
    assert.equal(init?.method, "GET");
    assert.equal(init?.redirect, "error");
    return Response.json(response([item(1)]));
  } });
  const results = await search.search("国内 高山 徒步 成熟路线");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].origin, "https://api.justoneapi.com");
  assert.equal(requests[0].pathname, "/api/search/v1");
  assert.deepEqual([...requests[0].searchParams.keys()].sort(), ["end", "keyword", "source", "start", "token"]);
  assert.equal(requests[0].searchParams.get("token"), token);
  assert.equal(requests[0].searchParams.get("keyword"), "国内 高山 徒步 成熟路线");
  assert.equal(requests[0].searchParams.get("source"), "ALL");
  assert.equal(requests[0].searchParams.get("start"), "2026-08-28 16:00:00");
  assert.equal(requests[0].searchParams.get("end"), "2026-09-27 16:00:00");
  assert.equal(requests[0].searchParams.has("nextCursor"), false);
  assert.deepEqual(results, [{ source: "Publisher 1", title: "Trail story 1",
    snippet: "Fresh travel idea 1", url: "https://example.test/story/1",
    publishedAt: new Date(1784563200000).toISOString() }]);
});

test("normalizes only observed JustOne fields, bounds results, and skips unusable entries", () => {
  const list = [
    { ...item(0), url: "javascript:alert(1)" },
    ...Array.from({ length: 12 }, (_, index) => item(index + 1)),
    item(1),
  ];
  const normalized = normalizeJustOneSearchResponse(response(list));
  assert.equal(normalized.length, 8);
  assert.equal(normalized[0].title, "Trail story 1");
  assert.equal(normalized[7].title, "Trail story 8");
  assert.deepEqual(Object.keys(normalized[0]).sort(), ["publishedAt", "snippet", "source", "title", "url"]);
});

test("rejects HTTP, API, and invalid response failures without exposing token", async () => {
  for (const [fakeResponse, kind] of [
    [new Response("unavailable", { status: 503 }), "http"],
    [Response.json({ code: 601, message: `token ${token} failed`, data: null }), "api"],
    [Response.json({ code: 0, data: { unexpected: [] } }), "invalid_response"],
  ] as const) {
    const search = new JustOneDiscoverySearch({ token, fetcher: async () => fakeResponse });
    await assert.rejects(search.search("徒步"), (error: unknown) =>
      error instanceof DiscoverySearchError && error.kind === kind && !error.message.includes(token));
  }
  assert.deepEqual(normalizeJustOneSearchResponse(response([])), []);
});

test("a missing token makes no HTTP request", async () => {
  let calls = 0;
  const search = new JustOneDiscoverySearch({ token: "", fetcher: async () => {
    calls += 1;
    throw new Error("Unexpected request");
  } });
  await assert.rejects(search.search("徒步"), DiscoverySearchError);
  assert.equal(calls, 0);
});
