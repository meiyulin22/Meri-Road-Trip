import assert from "node:assert/strict";
import test from "node:test";

import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import {
  createMoonshotChatModel, isAlwaysReasoningModel, modelDeadlineMs, moonshotRequestBody, reasoningEffortFromEnvironment, reasoningModelMinOutputTokens,
} from "./moonshot-chat-model";

test("K2 keeps thinking off; K3 gets a reasoning effort, no thinking or temperature, and room under max_tokens", () => {
  assert.deepEqual(moonshotRequestBody({ model: "kimi-k2.6", max_tokens: 400 }, "kimi-k2.6", "low"),
    { model: "kimi-k2.6", max_tokens: 400, thinking: { type: "disabled" } });
  assert.deepEqual(moonshotRequestBody({ model: "kimi-k3.1-pro", max_tokens: 400, temperature: 0.2, thinking: { type: "disabled" } }, "kimi-k3.1-pro", "low"),
    { model: "kimi-k3.1-pro", max_tokens: reasoningModelMinOutputTokens, reasoning_effort: "low" });
  // A cap already above the floor stays, and no cap stays none.
  assert.equal(moonshotRequestBody({ max_tokens: 20_000 }, "kimi-k3", "high").max_tokens, 20_000);
  assert.equal("max_tokens" in moonshotRequestBody({}, "kimi-k3", "low"), false);
});

test("only the K3 family always reasons; the effort comes from LLM_REASONING_EFFORT, low by default", () => {
  assert.deepEqual(["kimi-k3", "kimi-k3.1-pro", "kimi-k3.1-pro-highspeed", "kimi-k2.6", "kimi-k2.7-code", "kimi-k30"].map(isAlwaysReasoningModel),
    [true, true, true, false, false, false]);
  const env = (value?: string) => (value === undefined ? {} : { LLM_REASONING_EFFORT: value }) as unknown as NodeJS.ProcessEnv;
  assert.equal(reasoningEffortFromEnvironment(env()), "low");
  assert.equal(reasoningEffortFromEnvironment(env("max")), "max");
  assert.equal(reasoningEffortFromEnvironment(env("medium")), "low");
});

test("in a Mastra tool loop on K3, the reasoning of the tool-calling turn is sent back with it", async () => {
  const bodies: Record<string, unknown>[] = [];
  const reply = (message: Record<string, unknown>, finish: string) => new Response(JSON.stringify({
    id: "x", object: "chat.completion", created: 0, model: "kimi-k3.1-pro",
    choices: [{ index: 0, message: { role: "assistant", ...message }, finish_reason: finish }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  }), { headers: { "Content-Type": "application/json" } });
  const model = createMoonshotChatModel({
    apiKey: "test", baseUrl: "https://model.test/v1", model: "kimi-k3.1-pro", reasoningEffort: "low",
    fetch: async (_url, init) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return bodies.length === 1
        ? reply({ content: null, reasoning_content: "先查一下天气。", tool_calls: [{ id: "c1", type: "function", function: { name: "lookUp", arguments: "{\"city\":\"大理\"}" } }] }, "tool_calls")
        : reply({ content: "晴。" }, "stop");
    },
  });
  const agent = new Agent({
    id: "probe", name: "Probe", model, instructions: "Use the tool.",
    tools: { lookUp: createTool({ id: "look-up", description: "Look up a city.", inputSchema: z.object({ city: z.string() }), execute: async () => ({ sky: "clear" }) }) },
  });
  await agent.generate("大理天气？", { maxSteps: 3, modelSettings: { maxOutputTokens: 400 } });
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0].reasoning_effort, "low");
  assert.equal("thinking" in bodies[0], false);
  assert.equal(bodies[0].max_tokens, reasoningModelMinOutputTokens);
  const messages = bodies[1].messages as { role: string; reasoning_content?: string; tool_calls?: unknown }[];
  const assistant = messages.find((message) => message.role === "assistant" && message.tool_calls);
  assert.equal(assistant?.reasoning_content, "先查一下天气。");
});

test("deadlines stay as written for K2 and stretch 2.5 times for K3, which writes long JSON more slowly", () => {
  assert.equal(modelDeadlineMs(70_000, "kimi-k2.6"), 70_000);
  assert.equal(modelDeadlineMs(70_000, "kimi-k3.1-pro"), 175_000);
  assert.equal(modelDeadlineMs(8 * 60_000, "kimi-k3"), 20 * 60_000);
});
