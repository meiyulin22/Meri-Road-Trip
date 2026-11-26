import assert from "node:assert/strict";
import test from "node:test";

import { createDailyBudget } from "@/platform/http/daily-budget";

import { createBailianEmbedding, createEmbeddingFromEnvironment, EmbeddingError } from "./bailian-embedding";

const vector = (value: number) => Array.from({ length: 4 }, () => value);

function client(answer: (body: { input: string[] }) => Response, options: { paid?: boolean; dailyUnits?: number } = {}) {
  const requests: { url: string; body: { model: string; input: string[]; dimensions: number } }[] = [];
  const embedding = createBailianEmbedding({
    apiKey: "key", baseUrl: "https://ws.test/compatible-mode/v1/", model: "qwen3.7-text-embedding", dimensions: 4,
    paidCallsEnabled: () => options.paid ?? true,
    budget: options.dailyUnits === undefined ? undefined : createDailyBudget(
      { intervalMs: 0, dailyUnits: options.dailyUnits, pauseMs: 0 },
      { file: null, label: { provider: "test", units: (count) => `${count}` }, gate: { run: (task) => task(), pause: () => {} } },
    ),
    fetch: async (url, init) => {
      const body = JSON.parse(String(init?.body));
      requests.push({ url: String(url), body });
      return answer(body);
    },
  });
  return { embedding, requests };
}

test("sends the model, texts and size to the workspace's /embeddings and returns vectors in input order", async () => {
  const { embedding, requests } = client(() => Response.json({ data: [{ index: 1, embedding: vector(2) }, { index: 0, embedding: vector(1) }] }));
  assert.deepEqual(await embedding.embed(["洱海", "苍山"]), [vector(1), vector(2)]);
  assert.equal(requests[0].url, "https://ws.test/compatible-mode/v1/embeddings");
  assert.deepEqual(requests[0].body, { model: "qwen3.7-text-embedding", input: ["洱海", "苍山"], dimensions: 4, encoding_format: "float" });
});

test("a failed status, a wrong size or a missing vector is an error with its code, never a retry", async () => {
  const failed = client(() => new Response("{}", { status: 401 }));
  await assert.rejects(failed.embedding.embed(["洱海"]), (error: unknown) => error instanceof EmbeddingError && error.code === "http_error" && error.status === 401);
  assert.equal(failed.requests.length, 1);
  const short = client(() => Response.json({ data: [{ index: 0, embedding: [1, 2] }] }));
  await assert.rejects(short.embedding.embed(["洱海"]), (error: unknown) => error instanceof EmbeddingError && error.code === "invalid_response");
  const missing = client(() => Response.json({ data: [{ index: 0, embedding: vector(1) }] }));
  await assert.rejects(missing.embedding.embed(["洱海", "苍山"]), (error: unknown) => error instanceof EmbeddingError && error.code === "invalid_response");
});

test("nothing is sent with paid calls off, past the day's requests or above twenty texts", async () => {
  const off = client(() => Response.json({ data: [] }), { paid: false });
  await assert.rejects(off.embedding.embed(["洱海"]), (error: unknown) => error instanceof EmbeddingError && error.code === "paid_calls_paused");
  const capped = client(() => Response.json({ data: [{ index: 0, embedding: vector(1) }] }), { dailyUnits: 1 });
  await capped.embedding.embed(["洱海"]);
  await assert.rejects(capped.embedding.embed(["苍山"]), (error: unknown) => error instanceof EmbeddingError && error.code === "daily_limit");
  await assert.rejects(off.embedding.embed(Array.from({ length: 21 }, () => "x")), (error: unknown) => error instanceof EmbeddingError && error.code === "too_many_texts");
  assert.equal(off.requests.length + capped.requests.length, 1);
});

test("no key or no address, no client", () => {
  assert.equal(createEmbeddingFromEnvironment(4, { EMBEDDING_BASE_URL: "https://ws.test" }), null);
  assert.equal(createEmbeddingFromEnvironment(4, { DASHSCOPE_API_KEY: "key" }), null);
  assert.equal(createEmbeddingFromEnvironment(4, { DASHSCOPE_API_KEY: "key", EMBEDDING_BASE_URL: "https://ws.test" })?.model, "qwen3.7-text-embedding");
});
