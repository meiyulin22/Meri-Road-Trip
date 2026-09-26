import assert from "node:assert/strict";
import test from "node:test";

import { AiSdkKimiClient } from "./ai-sdk-kimi-client";
import { destinationRecommendationJsonSchema } from "./destination-recommendation-generator";

test("action-driven AI SDK call sends no synthetic user role and makes one provider request", async () => {
  const bodies: Record<string, unknown>[] = [];
  const client = new AiSdkKimiClient({
    apiKey: "test-key", baseUrl: "https://mock.moonshot.test/v1",
    model: "kimi-k2.6", debugRawOutput: false,
    fetch: async (_input, init) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return Response.json({
        id: "test", object: "chat.completion", created: 1, model: "kimi-k2.6",
        choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify({
          reply: "三个方向",
          destinations: [
            { name: "甲", region: null, reason: "方向一" },
            { name: "乙", region: null, reason: "方向二" },
            { name: "丙", region: null, reason: "方向三" },
          ],
        }) }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      });
    },
  });
  await client.generateStructuredOutput({
    requestId: "request-1", operation: "destination_recommendations",
    schemaName: "destination_recommendations", systemPrompt: "Persisted action: request_destination_recommendations",
    conversationHistory: [{ role: "user", content: "想出去走走" }, { role: "assistant", content: "可以一起想" }],
    jsonSchema: destinationRecommendationJsonSchema,
  });
  assert.equal(bodies.length, 1);
  assert.deepEqual(bodies[0].messages, [
    { role: "system", content: "Persisted action: request_destination_recommendations" },
    { role: "user", content: "想出去走走" },
    { role: "assistant", content: "可以一起想" },
  ]);
});
