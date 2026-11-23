import assert from "node:assert/strict";
import test from "node:test";

import type { PlanPdfStage } from "@/capabilities/planning/pdf-export/protocol";

import { PlanPdfDownloadError, requestPlanPdf } from "./pdf-download";

const ndjson = { "Content-Type": "application/x-ndjson" };

test("the PDF download collects real stages and a final record split across UTF-8 chunks", async () => {
  const pdf = { type: "pdf", filename: "云南小旅行.pdf", base64: "JVBERg==", version: 2, stale: true };
  const encoder = new TextEncoder();
  const bytes = encoder.encode([
    JSON.stringify({ type: "stage", stage: "opening" }),
    JSON.stringify({ type: "stage", stage: "printing" }),
    JSON.stringify(pdf),
  ].join("\n"));
  const splitName = bytes.indexOf(encoder.encode("云")[0]) + 1;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes.slice(0, 10));
      controller.enqueue(bytes.slice(10, splitName));
      controller.enqueue(bytes.slice(splitName));
      controller.close();
    },
  });
  const stages: PlanPdfStage[] = [];
  const { signal } = new AbortController();
  const download = await requestPlanPdf("saved/journey", signal, (stage) => stages.push(stage), async (path, init) => {
    assert.equal(path, "/api/trips/saved%2Fjourney/plan/pdf");
    assert.equal(init?.method, "POST");
    assert.equal(init?.signal, signal);
    return new Response(stream, { headers: ndjson });
  });
  assert.deepEqual(stages, ["opening", "printing"]);
  assert.deepEqual(download, pdf);
});

test("the PDF request preserves both an HTTP refusal and an error after streaming began", async () => {
  const { signal } = new AbortController();
  await assert.rejects(
    requestPlanPdf("trip", signal, () => {}, async () => Response.json({ error: { code: "limited" } }, { status: 429 })),
    (error: unknown) => error instanceof PlanPdfDownloadError && error.code === "limited",
  );
  const stages: PlanPdfStage[] = [];
  await assert.rejects(
    requestPlanPdf("trip", signal, (stage) => stages.push(stage), async () => new Response(
      '{"type":"stage","stage":"opening"}\n{"type":"error","code":"timeout"}\n', { headers: ndjson },
    )),
    (error: unknown) => error instanceof PlanPdfDownloadError && error.code === "timeout",
  );
  assert.deepEqual(stages, ["opening"]);
});

test("a stream that ends before sending the PDF fails instead of saving an incomplete download", async () => {
  await assert.rejects(
    requestPlanPdf("trip", new AbortController().signal, () => {}, async () => new Response(
      '{"type":"stage","stage":"printing"}\n', { headers: ndjson },
    )),
    (error: unknown) => error instanceof PlanPdfDownloadError && error.code === "failed",
  );
});
