import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";

import type { PlanRun, PlanVersion } from "@/domain/plan/plan-run";
import type { TripState } from "@/domain/trip-state/trip-state";
import { TripNotFoundError } from "@/domain/trip/trip-errors";

import { createPlanPdfHandler, loadPlanPdfSnapshot, type RenderPlanPdf } from "./plan-pdf";
import { planPdfEventSchema } from "./protocol";

const tripId = "3d17d2c7-fd9b-4748-b751-3a76a9a920be";
const guestId = "e9b46ac9-ef41-4d2b-afa2-97e9518547a3";
const now = "2026-11-23T12:00:00.000Z";
const tripState: TripState = {
  name: { state: "known", value: "云南小旅行", source: "user" },
  origin: { state: "missing" },
  destination: { state: "known", source: "user", areas: [{ province: "云南省", places: [{ name: "大理州", spots: [] }] }] },
  duration: { state: "known", value: "1天", source: "user" },
  startDate: { state: "missing" },
  endDate: { state: "missing" },
  transportPreference: { state: "missing" },
};
const run: PlanRun = {
  tripId, id: "run-2", status: "succeeded", handoffKey: "handoff-2", errorCode: null,
  handoff: { tripState, referenceDate: "2026-11-23", timezone: "Asia/Shanghai", locale: "zh", preferences: [], preferenceStatus: "ready" },
  usage: null, startedAt: now, finishedAt: now, durationMs: 1,
};
const version: PlanVersion = {
  tripId, id: "version-2", runId: run.id, version: 2, tripState, preferences: [], createdAt: now,
  plan: {
    status: "ready", dayPhotos: [], spots: [], cities: [], pendingProvinces: [], mapCheck: "complete",
    draft: {
      mode: "full", totalDays: 1, route: { source: "agent", cities: [], omitted: [] }, conflicts: [], unverified: [],
      days: [{ day: 1, date: null, province: "云南省", city: "大理州", arrivingFrom: null, focus: null, theme: null, stops: [] }],
    },
  },
};
const fakePdf = Buffer.from("%PDF-1.7\nfake renderer output");
const result = { type: "pdf", bytes: fakePdf, filename: "Meri-云南小旅行-v2.pdf", version: 2, stale: false } as const;
const ownerOnly = async (id: string, guest: string) => {
  assert.equal(id, tripId);
  if (guest !== guestId) throw new TripNotFoundError(id);
  return { tripState };
};
const requestSignal = () => new AbortController().signal;

async function events(response: Response) {
  const text = await response.text();
  return text.trim().split("\n").map((line) => planPdfEventSchema.parse(JSON.parse(line)));
}

test("uses the saved version's own run locale and compares the current state to that version", async () => {
  let versionReads = 0;
  const deps = {
    loadJourney: ownerOnly,
    repository: {
      async findLatestVersion(id: string) { assert.equal(id, tripId); versionReads++; return version; },
      async findRun(id: string, runId: string) { assert.deepEqual([id, runId], [tripId, version.runId]); return run; },
    },
  };
  assert.deepEqual(await loadPlanPdfSnapshot(tripId, "wrong-guest", deps), { status: "not_found" });
  assert.equal(versionReads, 0);
  assert.deepEqual(await loadPlanPdfSnapshot(tripId, guestId, deps), { status: "ready", version, locale: "zh", stale: false });
  assert.equal(versionReads, 1);

  const changedState: TripState = { ...tripState, name: { state: "known", value: "新旅程名", source: "user" } };
  assert.deepEqual(await loadPlanPdfSnapshot(tripId, guestId, { ...deps, loadJourney: async () => ({ tripState: changedState }) }),
    { status: "ready", version, locale: "zh", stale: true });
  assert.deepEqual(await loadPlanPdfSnapshot(tripId, guestId, {
    ...deps, repository: { ...deps.repository, async findLatestVersion() { return null; } },
  }), { status: "no_plan" });
  assert.deepEqual(await loadPlanPdfSnapshot(tripId, guestId, {
    ...deps, repository: {
      ...deps.repository,
      async findLatestVersion() { return { ...version, plan: { ...version.plan, draft: { ...version.plan.draft, mode: "preview" } } }; },
    },
  }), { status: "incomplete" });
});

test("refuses wrong owners and streams the actual renderer stages followed by the PDF", async () => {
  const handler = createPlanPdfHandler({
    loadJourney: ownerOnly,
    render: async ({ tripId: id, guestId: guest, reportStage }) => {
      assert.deepEqual([id, guest], [tripId, guestId]);
      reportStage("opening");
      reportStage("reading");
      reportStage("preparing");
      reportStage("printing");
      return { ...result, stale: true };
    },
  });
  for (const owner of [null, "wrong-guest"]) {
    const response = await handler(tripId, owner, requestSignal());
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: { code: "not_found" } });
  }
  assert.equal((await handler("invalid-id", guestId, requestSignal())).status, 404);

  const response = await handler(tripId, guestId, requestSignal());
  assert.equal(response.headers.get("Content-Type"), "application/x-ndjson; charset=utf-8");
  assert.match(response.headers.get("Cache-Control") ?? "", /no-store/);
  const { bytes, ...metadata } = result;
  assert.deepEqual(await events(response), [
    { type: "stage", stage: "opening" }, { type: "stage", stage: "reading" },
    { type: "stage", stage: "preparing" }, { type: "stage", stage: "printing" },
    { ...metadata, type: "pdf", base64: bytes.toString("base64"), stale: true },
  ]);
});

test("runs one render at a time, bounds the queue and drops a canceled waiter", async () => {
  const first = Promise.withResolvers<void>();
  let starts = 0;
  const handler = createPlanPdfHandler({
    loadJourney: ownerOnly, queueLimit: 1,
    async render({ reportStage }) {
      reportStage("reading");
      starts++;
      if (starts === 1) await first.promise;
      return result;
    },
  });
  const running = await handler(tripId, guestId, requestSignal());
  const waiting = await handler(tripId, guestId, requestSignal());
  assert.equal(starts, 1);
  const reader = waiting.body!.getReader();
  assert.deepEqual(JSON.parse(new TextDecoder().decode((await reader.read()).value)), { type: "stage", stage: "queued" });
  assert.equal((await handler(tripId, guestId, requestSignal())).status, 503);
  await reader.cancel();

  const next = await handler(tripId, guestId, requestSignal());
  assert.equal(starts, 1);
  first.resolve();
  assert.equal((await events(running)).at(-1)?.type, "pdf");
  assert.deepEqual((await events(next)).map((event) => event.type === "stage" ? event.stage : event.type), ["queued", "reading", "pdf"]);
  assert.equal(starts, 2);
});

test("enforces a per-owner quota and gives a stage-specific export error", async () => {
  const handler = createPlanPdfHandler({
    loadJourney: async () => ({ tripState }), guestLimit: 1,
    async render({ reportStage }) {
      reportStage("reading");
      return { type: "error", code: "incomplete" };
    },
  });
  const response = await handler(tripId, guestId, requestSignal());
  assert.deepEqual(await events(response), [{ type: "stage", stage: "reading" }, { type: "error", code: "incomplete" }]);
  assert.equal((await handler(tripId, guestId, requestSignal())).status, 429);
  assert.equal((await events(await handler(tripId, "another-guest", requestSignal()))).at(-1)?.type, "error");
});

test("signals the active renderer on timeout and releases the slot after cleanup", async () => {
  let starts = 0;
  let cleaned = false;
  const render: RenderPlanPdf = async ({ signal }) => {
    if (starts++ > 0) return result;
    try {
      await delay(2_000, undefined, { signal });
      assert.fail("Timed-out renderer should have been aborted");
    } finally {
      cleaned = true;
    }
  };
  const handler = createPlanPdfHandler({ loadJourney: ownerOnly, render, timeoutMs: 25 });
  assert.deepEqual(await events(await handler(tripId, guestId, requestSignal())), [{ type: "error", code: "timeout" }]);
  assert.equal(cleaned, true);
  assert.equal((await events(await handler(tripId, guestId, requestSignal())))[0].type, "pdf");
});
