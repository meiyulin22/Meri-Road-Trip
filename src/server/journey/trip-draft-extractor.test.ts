import assert from "node:assert/strict";
import test from "node:test";

import {
  InvalidTripDraftError,
  validateTripDraft,
} from "@/domain/trip-draft/trip-draft";
import {
  LlmProviderRequestError,
  type StructuredOutputModelClient,
  type StructuredOutputModelResponse,
} from "@/platform/llm/kimi-client";
import {
  extractTripDraft,
  InvalidModelOutputError,
  InvalidTripDraftRequestError,
} from "./trip-draft-extractor";

const validModelDraft = {
  name: { state: "known", value: "杭州周末游" },
  origin: { state: "missing", value: null },
  destination: { state: "known", value: "杭州" },
  startDate: { state: "known", value: "2026-09-19" },
  endDate: { state: "known", value: "2026-09-20" },
  duration: { state: "known", value: "两天" },
  transportPreference: { state: "known", value: "public_transport" },
};

const validInput = {
  message: "下周末坐高铁去杭州玩两天",
  requestId: "request_123",
  referenceDate: "2026-09-13",
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

function createJsonClient(value: unknown): StructuredOutputModelClient {
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
    origin: { state: "missing" },
    destination: { state: "known", value: "杭州" },
    startDate: { state: "known", value: "2026-09-19" },
    endDate: { state: "known", value: "2026-09-20" },
    duration: { state: "known", value: "两天" },
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

test("TripDraft extraction preserves a validated destination disambiguation signal", async () => {
  const modelDraft = { ...validModelDraft,
    destination: { state: "known", value: "潮汕" },
    destinationDisambiguation: { state: "known", value: ["潮州", "汕头", "揭阳"] } };
  const extracted = await extractTripDraft(validInput, createJsonClient(modelDraft));
  assert.deepEqual(extracted.destinationDisambiguation,
    { state: "known", value: ["潮州", "汕头", "揭阳"] });
  for (const bad of [
    { state: "known", value: [] }, { state: "known", value: ["潮州", "潮州"] },
    { state: "known", value: ["潮州", "汕头", "揭阳", "广州"] },
    { state: "known", value: ["潮州", "汕头"], coordinates: [1, 2] },
    { state: "missing", value: ["潮州", "汕头"] },
  ]) {
    assert.throws(() => validateTripDraft({ ...modelDraft, destinationDisambiguation: bad }), InvalidTripDraftError);
  }
  assert.throws(() => validateTripDraft({ ...modelDraft,
    destination: { state: "missing", value: null } }), InvalidTripDraftError);
});

test("malformed auxiliary output falls back to missing while preserving a valid TripDraft", async () => {
  const modelDraft = { ...validModelDraft,
    destination: { state: "known", value: "潮汕" },
    destinationDisambiguation: { state: "known", value: ["潮州"] } };
  const extracted = await extractTripDraft(validInput, createJsonClient(modelDraft));
  assert.deepEqual(extracted.destinationDisambiguation, { state: "missing", value: null });
  assert.deepEqual(extracted.destination, { state: "known", value: "潮汕" });
  assert.deepEqual(extracted.duration, { state: "known", value: "两天" });
  await assert.rejects(extractTripDraft(validInput, createJsonClient({ ...modelDraft,
    startDate: { state: "known", value: "invalid date" } })), InvalidTripDraftError);
});

test("rejects an internally inconsistent model draft", () => {
  assert.throws(
    () =>
      validateTripDraft({
        ...validModelDraft,
        destination: {
          state: "known",
          value: "杭州",
          explanation: "additional model commentary is not part of the contract",
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
      endDate: { state: "missing", value: null },
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
        value: "杭州城区或千岛湖",
      },
    }),
  );

  assert.deepEqual(draft.destination, {
    state: "ambiguous",
    value: "杭州城区或千岛湖",
  });
});

test("propagates a normalized provider failure", async () => {
  const providerError = new LlmProviderRequestError(new Error("network failed"));
  const client: StructuredOutputModelClient = {
    async generateStructuredOutput() {
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
