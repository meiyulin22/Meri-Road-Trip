import assert from "node:assert/strict";
import test from "node:test";

import { BochaWebSearchError, bochaSearchValues, requestBochaWebSearch } from "./bocha-web-search";

const page = { name: "Notice", url: "https://example.gov.cn/notice" };
const image = { contentUrl: "https://images.example.test/a.jpg", hostPageUrl: "https://example.test/a" };
const body = {
  code: 200, log_id: "log-1", msg: null,
  data: {
    _type: "SearchResponse",
    queryContext: { originalQuery: "query" },
    webPages: { webSearchUrl: "", totalEstimatedMatches: 100, value: [page], someResultsRemoved: true },
    images: { value: [image] },
    videos: null,
  },
};

test("one documented POST that never narrows freshness and never leaks the key", async () => {
  let calls = 0;
  const result = await requestBochaWebSearch({
    apiKey: "secret-value", query: "test query", count: 8, summary: true,
    fetcher: async (url, init) => {
      calls += 1;
      assert.equal(url, "https://api.bocha.cn/v1/web-search");
      assert.equal(init?.method, "POST");
      assert.equal(init?.redirect, "error");
      assert.equal((init?.headers as Record<string, string>)["Content-Type"], "application/json");
      assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer secret-value");
      // Bocha warns that a narrowed window often matches nothing, so noLimit is fixed
      // here and the ai-search-only answer and stream parameters are gone.
      assert.deepEqual(JSON.parse(String(init?.body)), {
        query: "test query", freshness: "noLimit", summary: true, count: 8,
      });
      return Response.json(body);
    },
  });
  assert.equal(calls, 1);
  assert.deepEqual(result, body);
});

test("both sections are read from data, and an absent section is empty rather than malformed", () => {
  assert.deepEqual(bochaSearchValues(body, "webPages"), [page]);
  assert.deepEqual(bochaSearchValues(body, "images"), [image]);
  // A query that matched no images of its own still answers the web-page question.
  assert.deepEqual(bochaSearchValues({ code: 200, data: { webPages: { value: [page] } } }, "images"), []);
  assert.deepEqual(bochaSearchValues({ code: 200, data: { images: { value: null } } }, "images"), []);
  assert.deepEqual(bochaSearchValues({ code: 0, data: {} }, "webPages"), []);
});

test("envelope, API code, and section shape failures each name their own kind", () => {
  for (const [value, kind] of [
    ["not an object", "invalid_response"],
    [{ code: 403, msg: "You do not have enough money" }, "api"],
    [{ code: 401, msg: "Invalid API KEY" }, "api"],
    [{ code: 200 }, "invalid_response"],
    [{ code: 200, data: { webPages: { value: "pages" } } }, "invalid_response"],
  ] as const) {
    assert.throws(() => bochaSearchValues(value, "webPages"),
      (error: unknown) => error instanceof BochaWebSearchError && error.kind === kind);
  }
  // The old ai-search envelope carries no data section, so pointing this at the
  // wrong endpoint fails loudly instead of quietly returning nothing.
  assert.throws(() => bochaSearchValues({ code: 200, messages: [] }, "webPages"),
    (error: unknown) => error instanceof BochaWebSearchError && error.kind === "invalid_response");
});

test("transport failures separate a timeout from a network fault and stay sanitized", async () => {
  for (const [fetcher, kind] of [
    [async () => { const error = new Error("secret-value timed out"); error.name = "TimeoutError"; throw error; }, "timeout"],
    [async () => { throw new Error("connect https://api.bocha.cn?key=secret-value"); }, "network"],
    [async () => new Response("secret-value", { status: 500 }), "http"],
    [async () => new Response("not json", { status: 200 }), "invalid_response"],
  ] as const) {
    await assert.rejects(
      requestBochaWebSearch({ apiKey: "secret-value", query: "q", count: 8, summary: false, fetcher }),
      (error: unknown) => error instanceof BochaWebSearchError && error.kind === kind
        && !error.message.includes("secret-value"));
  }
});

test("a missing key makes no HTTP request at all", async () => {
  let calls = 0;
  await assert.rejects(requestBochaWebSearch({
    apiKey: "  ", query: "q", count: 8, summary: false,
    fetcher: async () => { calls += 1; throw new Error("Unexpected request"); },
  }), (error: unknown) => error instanceof BochaWebSearchError && error.kind === "configuration");
  assert.equal(calls, 0);
});
