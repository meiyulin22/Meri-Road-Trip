import assert from "node:assert/strict";
import test from "node:test";

import {
  InvalidTripDraftError,
  validateTripDraft,
} from "@/domain/trip-draft/trip-draft";
import {
  LlmProviderRequestError,
  type TripDraftModelClient,
  type TripDraftModelResponse,
} from "@/server/ai/kimi-client";
import {
  extractTripDraft,
  InvalidModelOutputError,
  InvalidTripDraftRequestError,
} from "@/server/ai/trip-draft-extractor";

const validModelDraft = {
  name: { state: "known", value: "杭州周末游", note: null },
  destination: { state: "known", value: "杭州", note: null },
  startDate: { state: "known", value: "2026-09-19", note: null },
  endDate: { state: "known", value: "2026-09-20", note: null },
  transportPreference: {
    state: "known",
    value: "public_transport",
    note: null,
  },
};

const validInput = {
  message: "下周末坐高铁去杭州玩两天",
  requestId: "request_123",
  referenceDate: "2026-09-13",
  timezone: "Asia/Shanghai",
};

function createClient(
  response: TripDraftModelResponse,
  onRequest?: (
    request: Parameters<TripDraftModelClient["generateTripDraft"]>[0],
  ) => void,
): TripDraftModelClient {
  return {
    async generateTripDraft(request) {
      onRequest?.(request);
      return response;
    },
  };
}

function createJsonClient(value: unknown): TripDraftModelClient {
  return createClient({
    content: JSON.stringify(value),
    model: "kimi-k2.6",
    finishReason: "stop",
    usage: { inputTokens: 50, outputTokens: 25, totalTokens: 75 },
  });
}

test("extracts a valid TripDraft without creating a Trip", async () => {
  let capturedPrompt = "";
  const draft = await extractTripDraft(
    validInput,
    createClient(
      {
        content: JSON.stringify(validModelDraft),
        model: "kimi-k2.6",
        finishReason: "stop",
      },
      (request) => {
        capturedPrompt = request.systemPrompt;
      },
    ),
  );

  assert.deepEqual(draft, {
    name: { state: "known", value: "杭州周末游" },
    destination: { state: "known", value: "杭州" },
    startDate: { state: "known", value: "2026-09-19" },
    endDate: { state: "known", value: "2026-09-20" },
    transportPreference: { state: "known", value: "public_transport" },
  });

  assert.match(capturedPrompt, /Reference date: 2026-09-13/);
  assert.match(capturedPrompt, /Timezone: Asia\/Shanghai/);
});

test("rejects an empty natural-language message before calling the model", async () => {
  let called = false;
  const client = createClient(
    { content: null, model: "kimi-k2.6", finishReason: null },
    () => {
      called = true;
    },
  );

  await assert.rejects(
    extractTripDraft({ ...validInput, message: "   " }, client),
    InvalidTripDraftRequestError,
  );
  assert.equal(called, false);
});

test("accepts a valid model draft in application-side validation", () => {
  assert.doesNotThrow(() => validateTripDraft(validModelDraft));
});

test("rejects an internally inconsistent model draft", () => {
  assert.throws(
    () =>
      validateTripDraft({
        ...validModelDraft,
        destination: {
          state: "known",
          value: "杭州",
          note: "note must be null for known fields",
        },
      }),
    InvalidTripDraftError,
  );
});

test("preserves explicitly missing fields", async () => {
  const draft = await extractTripDraft(
    validInput,
    createJsonClient({
      ...validModelDraft,
      endDate: { state: "missing", value: null, note: null },
    }),
  );

  assert.deepEqual(draft.endDate, { state: "missing" });
});

test("preserves explicitly ambiguous fields", async () => {
  const draft = await extractTripDraft(
    validInput,
    createJsonClient({
      ...validModelDraft,
      destination: {
        state: "ambiguous",
        value: null,
        note: "用户可能指杭州城区，也可能指千岛湖。",
      },
    }),
  );

  assert.deepEqual(draft.destination, {
    state: "ambiguous",
    description: "用户可能指杭州城区，也可能指千岛湖。",
  });
});

test("propagates a normalized provider failure", async () => {
  const providerError = new LlmProviderRequestError(new Error("network failed"));
  const client: TripDraftModelClient = {
    async generateTripDraft() {
      throw providerError;
    },
  };

  await assert.rejects(extractTripDraft(validInput, client), providerError);
});

test("rejects non-JSON model output without repairing it", async () => {
  const client = createClient({
    content: "Here is your trip draft: not-json",
    model: "kimi-k2.6",
    finishReason: "stop",
  });

  await assert.rejects(
    extractTripDraft(validInput, client),
    InvalidModelOutputError,
  );
});

test("rejects JSON that does not satisfy the TripDraft contract", async () => {
  await assert.rejects(
    extractTripDraft(
      validInput,
      createJsonClient({ ...validModelDraft, destination: null }),
    ),
    InvalidTripDraftError,
  );
});
