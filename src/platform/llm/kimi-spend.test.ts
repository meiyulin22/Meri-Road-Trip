import assert from "node:assert/strict";
import test from "node:test";

import { generateText } from "ai";

import { createDailyBudget } from "@/platform/http/daily-budget";
import type { Gate } from "@/platform/http/request-pacer";

import { kimiCostFen, kimiRefusalNow, kimiRefusalOf, meteredKimiFetch, usageOf } from "./kimi-spend";
import { createMoonshotChatModel } from "./moonshot-chat-model";

const straightThrough: Gate = { run: (task) => task(), pause: () => {} };
const meter = (fen: number) => createDailyBudget({ intervalMs: 0, dailyUnits: fen, pauseMs: 0 }, {
  file: null, gate: straightThrough, label: { provider: "Kimi", units: (units) => `¥${(units / 100).toFixed(2)}` },
});
const completion = (usage: unknown) => Response.json({
  id: "c", model: "kimi-k3.1-pro", created: 1,
  choices: [{ index: 0, message: { role: "assistant", content: "好" }, finish_reason: "stop" }], usage,
});
const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

test("a call's cost comes from its tokens at the model's prices, cache hits at the cache price (step 2)", () => {
  // 15,000 input and 1,000 output on kimi-k3.1-pro: ¥0.195 + ¥0.068.
  assert.equal(Math.round(kimiCostFen("kimi-k3.1-pro", { inputTokens: 15_000, outputTokens: 1_000, cachedTokens: 0 }) * 100) / 100, 26.3);
  // Half the input from the cache: ¥0.0975 + ¥0.00975 + ¥0.068.
  assert.equal(Math.round(kimiCostFen("kimi-k3.1-pro", { inputTokens: 15_000, outputTokens: 1_000, cachedTokens: 7_500 }) * 100) / 100, 17.52);
  // An unknown model is priced as the dearest, so the cap errs on the safe side.
  assert.ok(kimiCostFen("kimi-k9", { inputTokens: 1_000_000, outputTokens: 0, cachedTokens: 0 }) >= 2_600);
});

test("usage is read in either of Kimi's cache shapes, and without one all input is full price", () => {
  assert.deepEqual(usageOf({ usage: { prompt_tokens: 100, completion_tokens: 20, cached_tokens: 40 } }), { inputTokens: 100, outputTokens: 20, cachedTokens: 40 });
  assert.deepEqual(usageOf({ usage: { prompt_tokens: 100, completion_tokens: 20, prompt_tokens_details: { cached_tokens: 30 } } }), { inputTokens: 100, outputTokens: 20, cachedTokens: 30 });
  assert.deepEqual(usageOf({ usage: { prompt_tokens: 100, completion_tokens: 20 } }), { inputTokens: 100, outputTokens: 20, cachedTokens: 0 });
  assert.equal(usageOf({}), null);
});

test("each answer is counted after it arrives; a spent day or the switch refuses before Kimi is called", async () => {
  const day = meter(30);
  let sent = 0;
  const base = async () => { sent += 1; return completion({ prompt_tokens: 15_000, completion_tokens: 1_000 }); };
  const metered = meteredKimiFetch(day, base, () => true);
  const body = JSON.stringify({ model: "kimi-k3.1-pro", messages: [] });
  assert.equal((await metered("https://kimi.test/v1/chat/completions", { method: "POST", body })).status, 200);
  await settle();
  assert.equal(kimiRefusalNow(day, () => true), null);
  // The second call takes the day past ¥0.30: the third is refused without reaching Kimi.
  await metered("https://kimi.test/v1/chat/completions", { method: "POST", body });
  await settle();
  const refused = await metered("https://kimi.test/v1/chat/completions", { method: "POST", body });
  assert.equal(refused.status, 403);
  assert.equal(sent, 2);
  assert.equal(kimiRefusalNow(day, () => true), "daily_quota");
  // The switch wins over a day with room.
  const paused = meteredKimiFetch(meter(10_000), base, () => false);
  assert.equal((await paused("https://kimi.test", { method: "POST", body })).status, 403);
  assert.equal(sent, 2);
  assert.equal(kimiRefusalNow(meter(10_000), () => false), "paid_calls_paused");
});

test("a stream's usage is counted from its last chunks", async () => {
  // 1,000 input and 100 output on kimi-k2.6 cost 0.92 fen: past a 0.5-fen day.
  const day = meter(0.5);
  const stream = new Response([
    'data: {"choices":[{"delta":{"content":"好"}}]}',
    'data: {"choices":[],"usage":{"prompt_tokens":1000,"completion_tokens":100}}',
    "data: [DONE]",
  ].join("\n\n"), { headers: { "content-type": "text/event-stream" } });
  await meteredKimiFetch(day, async () => stream, () => true)("https://kimi.test", { method: "POST", body: JSON.stringify({ model: "kimi-k2.6" }) });
  await settle();
  assert.equal(day.room(), false);
});

test("the refusal reaches callers through the AI SDK's own error and is told apart (step 2)", async () => {
  const model = createMoonshotChatModel({
    apiKey: "test", baseUrl: "https://kimi.test/v1", model: "kimi-k3.1-pro",
    fetch: meteredKimiFetch(meter(10_000), async () => { throw new Error("Kimi should not be called"); }, () => false),
  });
  const error = await generateText({ model, prompt: "你好", maxRetries: 0 }).then(() => null, (failure: unknown) => failure);
  assert.equal(kimiRefusalOf(error), "paid_calls_paused");
  assert.equal(kimiRefusalOf(new Error("upstream timeout")), null);
});
