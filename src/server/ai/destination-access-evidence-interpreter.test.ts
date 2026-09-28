import assert from "node:assert/strict";
import test from "node:test";

import type { DestinationCandidate } from "@/domain/location/destination-candidates";
import type { StructuredOutputModelClient } from "@/platform/llm/kimi-client";
import { LlmDestinationAccessEvidenceInterpreter, validateAccessInterpretation, type AccessEvidenceInput } from "./destination-access-evidence-interpreter";

const candidate: DestinationCandidate = { id: "id-1", name: "示例线", region: "示例省", preferenceRationale: "Matches preferences." };
const evidence: AccessEvidenceInput[] = [{ id: "e1", official: true, title: "示例线禁止通行公告",
  url: "https://example.gov.cn/notice", siteName: "Example government", snippet: "示例线禁止通行",
  publishedAt: "2026-09-20T00:00:00.000Z" }];

test("dedicated interpreter sends only candidate and normalized evidence with a narrow structured schema", async () => {
  const client: StructuredOutputModelClient = { async generateStructuredOutput(request) {
    assert.equal(request.operation, "destination_access_interpretation");
    assert.equal(request.schemaName, "destination_access_interpretation");
    assert.match(request.systemPrompt, /Do not use prior knowledge/);
    assert.match(request.systemPrompt, /Do not assess weather, fitness/);
    assert.deepEqual(JSON.parse(request.userMessage ?? ""), {
      candidate: { name: "示例线", region: "示例省" },
      evidence: [{ id: "e1", official: true, title: evidence[0].title, url: evidence[0].url,
        siteName: evidence[0].siteName, snippet: evidence[0].snippet, publishedAt: evidence[0].publishedAt }],
    });
    return { content: JSON.stringify({ status: "blocked", reason: "Official notice prohibits access.", evidenceIds: ["e1"] }),
      model: "test", finishReason: "stop" };
  } };
  const result = await new LlmDestinationAccessEvidenceInterpreter(client).interpret(candidate, evidence);
  assert.deepEqual(result.evidenceIds, ["e1"]);
});

test("rejects invented, duplicated, missing, or URL-bearing citations and invalid schema", () => {
  const base = { status: "blocked", reason: "Official notice prohibits access.", evidenceIds: ["e1"] };
  for (const output of [
    { ...base, evidenceIds: ["invented"] },
    { ...base, evidenceIds: ["e1", "e1"] },
    { ...base, evidenceIds: [] },
    { ...base, reason: "See https://invented.test" },
    { ...base, extra: "unsafe" },
  ]) assert.throws(() => validateAccessInterpretation(output, evidence));
  assert.deepEqual(validateAccessInterpretation({ status: "uncertain", reason: "Insufficient evidence.", evidenceIds: [] }, evidence),
    { status: "uncertain", reason: "Insufficient evidence.", evidenceIds: [] });
});
