import assert from "node:assert/strict";
import test from "node:test";

import type { TripMessage } from "@/domain/trip-message/trip-message";
import type { StructuredOutputModelClient, StructuredOutputModelRequest } from "@/platform/llm/kimi-client";

import { extractPlanPreferences } from "./extract-plan-preferences";

const tripId = "trip-1";
const createdAt = "2026-11-09T16:00:00.000Z";

function message(id: string, content: string, role: TripMessage["role"] = "user"): TripMessage {
  return { id, tripId, role, content, createdAt };
}

function model(
  requests: StructuredOutputModelRequest[],
  content: string | null,
  finishReason = "stop",
): () => StructuredOutputModelClient {
  return () => ({
    async generateStructuredOutput(request) {
      requests.push(request);
      return { content, model: "test", finishReason };
    },
  });
}

test("extracts preferences once from saved user text and verifies their exact provenance", async () => {
  const history: TripMessage[] = [
    message("old", "我不吃辣"),
    message("assistant", "要不要轻松一点？", "assistant"),
    { ...message("new", "我想去丽江，三天。我不吃辣，晚上想早点休息。"), createdAt: "2026-11-10T16:00:00.000Z" },
  ];
  const requests: StructuredOutputModelRequest[] = [];
  const result = await extractPlanPreferences(history, "request-1", model(requests, JSON.stringify({
    preferences: [
      { messageId: "old", quote: "我不吃辣" },
      { messageId: "new", quote: "我不吃辣" },
      { messageId: "new", quote: "晚上想早点休息" },
      { messageId: "old", quote: "晚上想早点休息" },
      { messageId: "assistant", quote: "要不要轻松一点" },
      { messageId: "new", quote: "想早点睡" },
    ],
  })));

  assert.deepEqual(result, {
    preferences: [
      { messageId: "new", quote: "我不吃辣", createdAt: history[2].createdAt },
      { messageId: "new", quote: "晚上想早点休息", createdAt: history[2].createdAt },
    ],
    preferenceStatus: "ready",
  });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].requestId, "request-1");
  assert.equal(requests[0].tools, undefined);
  assert.deepEqual(JSON.parse(requests[0].userMessage!), [
    { id: "old", content: history[0].content },
    { id: "new", content: history[2].content },
  ]);
  assert.match(requests[0].systemPrompt, /newer correction/);
  assert.match(requests[0].systemPrompt, /Exclude place names and choices/);
});

test("bounds the submitted context and rejects quotes from earlier messages outside it", async () => {
  const history = Array.from({ length: 12 }, (_, index) => message(
    String(index), "偏好".repeat(400) + index,
  ));
  const requests: StructuredOutputModelRequest[] = [];
  const result = await extractPlanPreferences(history, "request-2", model(requests, JSON.stringify({
    preferences: [{ messageId: "4", quote: history[4].content.slice(-5) }],
  })));
  const sent = JSON.parse(requests[0].userMessage!);
  assert.deepEqual(sent.map((entry: { id: string }) => entry.id), ["5", "6", "7", "8", "9", "10", "11"]);
  assert.ok(requests[0].userMessage!.length <= 6_000);
  assert.deepEqual(result, { preferences: [], preferenceStatus: "unavailable" });

  const shortMessages = Array.from({ length: 12 }, (_, index) => message(String(index), "不吃辣"));
  await extractPlanPreferences(shortMessages, "request-3", model(requests, '{"preferences":[]}'));
  assert.equal(JSON.parse(requests[1].userMessage!).length, 10);
});

test("distinguishes no preferences from unavailable extraction and skips a model call without user input", async () => {
  const requests: StructuredOutputModelRequest[] = [];
  const client = model(requests, '{"preferences":[]}');
  const history = [message("user", "我想去丽江")];
  assert.deepEqual(await extractPlanPreferences([message("assistant", "你好", "assistant")], "empty", client),
    { preferences: [], preferenceStatus: "ready" });
  assert.deepEqual(await extractPlanPreferences([message("user", "长".repeat(6_001))], "oversized", client),
    { preferences: [], preferenceStatus: "unavailable" });
  assert.equal(requests.length, 0);
  assert.deepEqual(await extractPlanPreferences(history, "none", client),
    { preferences: [], preferenceStatus: "ready" });

  for (const unavailableClient of [
    model(requests, null),
    model(requests, "invalid JSON"),
    model(requests, '{"preferences":[]}', "length"),
    model(requests, '{"preferences":[{"messageId":"user","quote":"我想","createdAt":"invented"}]}'),
    () => { throw new Error("provider not configured"); },
    () => ({ async generateStructuredOutput() { throw new Error("provider failed"); } }),
  ]) {
    assert.deepEqual(await extractPlanPreferences(history, "failure", unavailableClient),
      { preferences: [], preferenceStatus: "unavailable" });
  }
});
