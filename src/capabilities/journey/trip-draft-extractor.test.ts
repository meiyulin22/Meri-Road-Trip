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
  destinationEdit: { operation: "set", places: ["杭州"], broadRegion: null },
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
    destinationEdit: { operation: "set", places: ["杭州"], broadRegion: null },
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

test("broad destination edits retain their expression and suggested cities",async()=>{
 const edit={operation:"set",places:["潮州市","汕头市","揭阳市"],broadRegion:"潮汕"};
 const result=await extractTripDraft(validInput,createJsonClient({...validModelDraft,destinationEdit:edit}));assert.deepEqual(result.destinationEdit,edit);
});

test("an invalid destination edit or date is dropped, never written, and the rest of the draft survives",async()=>{
 const invented=await extractTripDraft(validInput,createJsonClient({...validModelDraft,destinationEdit:{operation:"set",places:["潮州"],broadRegion:null,providerId:"invented"}}));
 assert.deepEqual(invented.destinationEdit,{operation:"none"});
 assert.deepEqual(invented.duration,{state:"known",value:"两天"});
 const badDate=await extractTripDraft(validInput,createJsonClient({...validModelDraft,startDate:{state:"known",value:"invalid date"}}));
 assert.deepEqual(badDate.startDate,{state:"missing"});
});
test("a draft that is not an object at all still fails",async()=>{
 await assert.rejects(extractTripDraft(validInput,createJsonClient("text")),InvalidTripDraftError);
});

test("unknown draft fields are rejected",()=>{assert.throws(()=>validateTripDraft({...validModelDraft,destination:{state:"known",value:"杭州"}}),InvalidTripDraftError);});

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

test("alternative destinations remain separate expressions for later selection",async()=>{
 const edit={operation:"set",places:["杭州城区","千岛湖"],broadRegion:null};const draft=await extractTripDraft(validInput,createJsonClient({...validModelDraft,destinationEdit:edit}));assert.deepEqual(draft.destinationEdit,edit);
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

test("a key outside the TripDraft contract is ignored rather than refusing the Journey", async () => {
  const draft = await extractTripDraft(validInput, createJsonClient({ ...validModelDraft, destination: null }));
  assert.equal("destination" in draft, false);
});
