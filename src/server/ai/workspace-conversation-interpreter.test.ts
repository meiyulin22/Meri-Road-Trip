import assert from "node:assert/strict";
import test from "node:test";

import type { TripState } from "@/domain/trip-state/trip-state";
import type {
  StructuredOutputModelClient,
  StructuredOutputModelResponse,
} from "@/server/ai/kimi-client";
import {
  interpretWorkspaceConversation,
  InvalidWorkspaceConversationModelOutputError,
} from "@/server/ai/workspace-conversation-interpreter";

const tripState: TripState = {
  name: { state: "known", value: "二世谷滑雪", source: "system" },
  origin: { state: "missing" },
  destination: { state: "known", value: "二世谷", source: "user" },
  startDate: { state: "missing" },
  endDate: { state: "missing" },
  duration: { state: "missing" },
  transportPreference: { state: "missing" },
};

const input = {
  message: "不去二世谷了，改成富良野",
  tripState,
  requestId: "request_workspace_123",
  referenceDate: "2026-09-19",
  timezone: "Asia/Shanghai",
};

function createClient(
  response: StructuredOutputModelResponse,
  onRequest?: (
    request: Parameters<StructuredOutputModelClient["generateStructuredOutput"]>[0],
  ) => void,
): StructuredOutputModelClient {
  return {
    async generateStructuredOutput(request) {
      onRequest?.(request);
      return response;
    },
  };
}

test("returns a validated change proposal without source metadata", async () => {
  let capturedOperation = "";
  let capturedPrompt = "";
  const interpretation = await interpretWorkspaceConversation(
    input,
    createClient(
      {
        content: JSON.stringify({
          intent: "trip_state_update",
          changes: [
            { field: "destination", state: "known", value: "富良野" },
          ],
          reply: "好的，目的地改成富良野。",
        }),
        model: "kimi-k2.6",
        finishReason: "stop",
      },
      (request) => {
        capturedOperation = request.operation;
        capturedPrompt = request.systemPrompt;
      },
    ),
  );

  assert.equal(capturedOperation, "workspace_conversation_interpretation");
  assert.match(capturedPrompt, /二世谷/);
  assert.deepEqual(interpretation.changes, [
    { field: "destination", state: "known", value: "富良野" },
  ]);
});

test("passes recent assistant context and current TripState for a confirmation", async () => {
  let capturedRequest:
    | Parameters<StructuredOutputModelClient["generateStructuredOutput"]>[0]
    | undefined;
  await interpretWorkspaceConversation(
    {
      ...input,
      message: "Yes.",
      conversationHistory: [
        { role: "user", content: "Could we go to Furano?" },
        {
          role: "assistant",
          content: "Would you like to change the destination to Furano?",
        },
      ],
    },
    createClient(
      {
        content: JSON.stringify({
          intent: "trip_state_update",
          changes: [{ field: "destination", state: "known", value: "富良野" }],
          reply: "好的，目的地改成富良野。",
        }),
        model: "kimi-k2.6",
        finishReason: "stop",
      },
      (request) => {
        capturedRequest = request;
      },
    ),
  );

  assert.deepEqual(capturedRequest?.conversationHistory, [
    { role: "user", content: "Could we go to Furano?" },
    {
      role: "assistant",
      content: "Would you like to change the destination to Furano?",
    },
  ]);
  assert.equal(capturedRequest?.userMessage, "Yes.");
  assert.match(capturedRequest?.systemPrompt ?? "", /"destination":\{"state":"known","value":"二世谷"/);
});

test("rejects invalid model output without applying partial data", async () => {
  await assert.rejects(
    interpretWorkspaceConversation(
      input,
      createClient({
        content: "not-json",
        model: "kimi-k2.6",
        finishReason: "stop",
      }),
    ),
    InvalidWorkspaceConversationModelOutputError,
  );
});
