import assert from "node:assert/strict";
import test from "node:test";

import { tripDraftJsonSchema } from "@/server/ai/trip-draft-extractor";
import { workspaceConversationJsonSchema } from "@/server/ai/workspace-conversation-interpreter";
import {
  AiSdkKimiClient,
  createAiSdkKimiClientFromEnvironment,
} from "@/server/ai/ai-sdk-kimi-client";
import {
  LlmProviderRequestError,
  LlmProviderTimeoutError,
  MissingLlmConfigurationError,
  createKimiClientFromEnvironment,
} from "@/server/ai/kimi-client";

const originalMoonshotApiKey = process.env.MOONSHOT_API_KEY;
const originalMoonshotBaseUrl = process.env.MOONSHOT_BASE_URL;
const originalLlmModel = process.env.LLM_MODEL;
const originalFetch = globalThis.fetch;

function createProviderResponse({
  content = JSON.stringify({
    name: { state: "known", value: "Ski trip" },
    origin: { state: "missing", value: null },
    destination: { state: "missing", value: null },
    startDate: { state: "approximate", value: "今年冬天" },
    endDate: { state: "missing", value: null },
    duration: { state: "missing", value: null },
    transportPreference: { state: "missing", value: null },
  }),
  finishReason = "stop",
  model = "kimi-k2.6",
  usage = {
    prompt_tokens: 21,
    completion_tokens: 13,
    completion_tokens_details: { reasoning_tokens: 3 },
    total_tokens: 34,
  },
}: {
  content?: string | null;
  finishReason?: string;
  model?: string;
  usage?: Record<string, unknown> | null;
} = {}): Response {
  return Response.json({
    id: "chatcmpl_test",
    object: "chat.completion",
    created: 1_800_000_000,
    model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content },
        finish_reason: finishReason,
      },
    ],
    usage,
  });
}

function createClient(
  fetchImplementation: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  requestTimeoutMs = 60_000,
): AiSdkKimiClient {
  return new AiSdkKimiClient({
    apiKey: "test-key",
    baseUrl: "https://api.moonshot.cn/v1",
    model: "kimi-k2.6",
    debugRawOutput: false,
    requestTimeoutMs,
    fetch: fetchImplementation,
  });
}

function createRequest() {
  return {
    requestId: "request_123",
    operation: "trip_draft_extraction",
    schemaName: "trip_draft",
    systemPrompt: "Extract the trip draft.",
    userMessage: "今年冬天想找个地方滑雪",
    jsonSchema: tripDraftJsonSchema,
  } as const;
}

test.afterEach(() => {
  if (originalMoonshotApiKey === undefined) {
    delete process.env.MOONSHOT_API_KEY;
  } else {
    process.env.MOONSHOT_API_KEY = originalMoonshotApiKey;
  }

  if (originalMoonshotBaseUrl === undefined) {
    delete process.env.MOONSHOT_BASE_URL;
  } else {
    process.env.MOONSHOT_BASE_URL = originalMoonshotBaseUrl;
  }

  if (originalLlmModel === undefined) {
    delete process.env.LLM_MODEL;
  } else {
    process.env.LLM_MODEL = originalLlmModel;
  }

  globalThis.fetch = originalFetch;
});

test("sends the current strict JSON Schema request with Kimi thinking disabled", async () => {
  let requestUrl: string | undefined;
  let requestHeaders: Headers | undefined;
  let requestBody: Record<string, unknown> | undefined;
  let requestCount = 0;
  const client = createClient(async (input, init) => {
    requestCount += 1;
    requestUrl = String(input);
    requestHeaders = new Headers(init?.headers);
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return createProviderResponse();
  });

  const response = await client.generateStructuredOutput(createRequest());

  assert.equal(requestCount, 1);
  assert.equal(requestUrl, "https://api.moonshot.cn/v1/chat/completions");
  assert.equal(requestHeaders?.get("authorization"), "Bearer test-key");
  assert.equal(requestBody?.model, "kimi-k2.6");
  assert.deepEqual(requestBody?.messages, [
    { role: "system", content: "Extract the trip draft." },
    { role: "user", content: "今年冬天想找个地方滑雪" },
  ]);
  assert.deepEqual(requestBody?.response_format, {
    type: "json_schema",
    json_schema: {
      name: "trip_draft",
      strict: true,
      schema: tripDraftJsonSchema,
    },
  });
  assert.deepEqual(requestBody?.thinking, { type: "disabled" });
  assert.equal("stream" in (requestBody ?? {}), false);
  assert.deepEqual(response, {
    content: JSON.stringify({
      name: { state: "known", value: "Ski trip" },
      origin: { state: "missing", value: null },
      destination: { state: "missing", value: null },
      startDate: { state: "approximate", value: "今年冬天" },
      endDate: { state: "missing", value: null },
      duration: { state: "missing", value: null },
      transportPreference: { state: "missing", value: null },
    }),
    model: "kimi-k2.6",
    finishReason: "stop",
    usage: {
      inputTokens: 21,
      outputTokens: 13,
      reasoningTokens: 3,
      totalTokens: 34,
    },
  });
});

test("legacy and AI SDK clients forward the same hardened Workspace schema", async () => {
  const responseContent = JSON.stringify({
    intent: "trip_state_update",
    changes: [{ field: "destination", state: "known", value: "富良野" }],
    reply: "好的，目的地改成富良野。",
  });
  const request = {
    requestId: "request_workspace_schema",
    operation: "workspace_conversation_interpretation",
    schemaName: "workspace_conversation_interpretation",
    systemPrompt: "Interpret the workspace message.",
    userMessage: "不去二世谷了，改成富良野",
    jsonSchema: workspaceConversationJsonSchema,
  } as const;
  const capturedBodies: Record<string, unknown>[] = [];
  const captureRequest = async (_input: RequestInfo | URL, init?: RequestInit) => {
    capturedBodies.push(
      JSON.parse(String(init?.body)) as Record<string, unknown>,
    );
    return createProviderResponse({ content: responseContent });
  };

  await createClient(captureRequest).generateStructuredOutput(request);

  process.env.MOONSHOT_API_KEY = "legacy-test-key";
  process.env.MOONSHOT_BASE_URL = "https://mock.moonshot.test/v1";
  process.env.LLM_MODEL = "kimi-k2.6";
  globalThis.fetch = captureRequest;
  await createKimiClientFromEnvironment().generateStructuredOutput(request);

  assert.equal(capturedBodies.length, 2);
  for (const body of capturedBodies) {
    assert.deepEqual(body.response_format, {
      type: "json_schema",
      json_schema: {
        name: "workspace_conversation_interpretation",
        strict: true,
        schema: workspaceConversationJsonSchema,
      },
    });
    assert.deepEqual(
      (
        body.response_format as unknown as {
          json_schema: {
            schema: { properties: { reply: Record<string, unknown> } };
          };
        }
      ).json_schema.schema.properties.reply,
      { type: "string", minLength: 1 },
    );
  }
});

test("AI SDK and legacy clients send historical roles before the current user", async () => {
  const request = {
    requestId: "request_workspace_history",
    operation: "workspace_conversation_interpretation",
    schemaName: "workspace_conversation_interpretation",
    systemPrompt: "Current authoritative TripState: Furano",
    conversationHistory: [
      { role: "user" as const, content: "Could we go to Furano?" },
      {
        role: "assistant" as const,
        content: "Would you like to change the destination to Furano?",
      },
    ],
    userMessage: "Yes.",
    jsonSchema: workspaceConversationJsonSchema,
  };
  const capturedBodies: Record<string, unknown>[] = [];
  const captureRequest = async (_input: RequestInfo | URL, init?: RequestInit) => {
    capturedBodies.push(
      JSON.parse(String(init?.body)) as Record<string, unknown>,
    );
    return createProviderResponse({
      content: JSON.stringify({
        intent: "trip_state_update",
        changes: [{ field: "destination", state: "known", value: "富良野" }],
        reply: "好的，目的地改成富良野。",
      }),
    });
  };

  await createClient(captureRequest).generateStructuredOutput(request);

  process.env.MOONSHOT_API_KEY = "legacy-test-key";
  process.env.MOONSHOT_BASE_URL = "https://mock.moonshot.test/v1";
  process.env.LLM_MODEL = "kimi-k2.6";
  globalThis.fetch = captureRequest;
  await createKimiClientFromEnvironment().generateStructuredOutput(request);

  assert.equal(capturedBodies.length, 2);
  for (const body of capturedBodies) {
    assert.deepEqual(body.messages, [
      { role: "system", content: request.systemPrompt },
      ...request.conversationHistory,
      { role: "user", content: "Yes." },
    ]);
  }
});

test("returns invalid structured output for Meri domain validation", async () => {
  const client = createClient(async () =>
    createProviderResponse({ content: "not-json" }),
  );

  const response = await client.generateStructuredOutput(createRequest());

  assert.equal(response.content, "not-json");
  assert.equal(response.finishReason, "stop");
});

test("preserves truncated incomplete output and the length finish reason", async () => {
  const client = createClient(async () =>
    createProviderResponse({ content: '{"name":', finishReason: "length" }),
  );

  const response = await client.generateStructuredOutput(createRequest());

  assert.equal(response.content, '{"name":');
  assert.equal(response.finishReason, "length");
});

test("preserves raw provider finish reasons", async () => {
  const client = createClient(async () =>
    createProviderResponse({ content: null, finishReason: "content_filter" }),
  );

  const response = await client.generateStructuredOutput(createRequest());

  assert.equal(response.content, null);
  assert.equal(response.finishReason, "content_filter");
});

test("omits usage when the provider does not return token counts", async () => {
  const client = createClient(async () => createProviderResponse({ usage: null }));

  const response = await client.generateStructuredOutput(createRequest());

  assert.equal(response.usage, undefined);
});

test("normalizes request timeouts without retrying", async () => {
  let requestCount = 0;
  const client = createClient((_input, init) => {
    requestCount += 1;
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener(
        "abort",
        () => reject(init.signal?.reason),
        { once: true },
      );
    });
  }, 5);

  await assert.rejects(
    () => client.generateStructuredOutput(createRequest()),
    (error: unknown) =>
      error instanceof LlmProviderTimeoutError &&
      error.cause instanceof DOMException &&
      error.cause.name === "TimeoutError",
  );
  assert.equal(requestCount, 1);
});

test("normalizes provider HTTP errors without retrying", async () => {
  let requestCount = 0;
  const client = createClient(async () => {
    requestCount += 1;
    return Response.json(
      {
        error: {
          message: "Rate limit exceeded",
          type: "rate_limit_error",
          code: "rate_limit_exceeded",
        },
      },
      { status: 429 },
    );
  });

  await assert.rejects(
    () => client.generateStructuredOutput(createRequest()),
    (error: unknown) => {
      if (!(error instanceof LlmProviderRequestError)) {
        return false;
      }

      const cause = error.cause as Error & { statusCode?: number };
      return (
        cause.name === "AI_APICallError" &&
        cause.statusCode === 429 &&
        cause.message === "Rate limit exceeded"
      );
    },
  );
  assert.equal(requestCount, 1);
});

test("keeps the AI SDK environment factory opt-in and validates configuration", () => {
  delete process.env.MOONSHOT_API_KEY;

  assert.throws(
    () => createAiSdkKimiClientFromEnvironment(),
    MissingLlmConfigurationError,
  );
});
