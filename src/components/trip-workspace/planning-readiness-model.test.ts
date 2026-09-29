import assert from "node:assert/strict";
import test from "node:test";

import type { TripState } from "@/domain/trip-state/trip-state";

import { canRequestPlanGeneration, planningReadinessMessage, requestPlanningReadiness, shouldHighlightMissingDestination } from "./planning-readiness-model";

const tripState: TripState = {
  name: { state: "known", value: "旅行", source: "user" },
  origin: { state: "missing" },
  destination: { state: "missing" },
  startDate: { state: "missing" },
  endDate: { state: "missing" },
  duration: { state: "missing" },
  transportPreference: { state: "missing" },
};

test("client request reads the focused endpoint without writing Journey state", async () => {
  const result = await requestPlanningReadiness("trip id", async (input, init) => {
    assert.equal(input, "/api/trips/trip%20id/planning-readiness");
    assert.equal(init?.method, "GET");
    assert.equal(init?.cache, "no-store");
    return Response.json({ canProceed: true, destination: "selected" });
  });
  assert.deepEqual(result, { canProceed: true, destination: "selected" });
});

test("an empty Journey receives the destination_missing message from the readiness endpoint", async () => {
  let calls = 0;
  const result = await requestPlanningReadiness("empty-trip", async (input, init) => {
    calls += 1;
    assert.equal(input, "/api/trips/empty-trip/planning-readiness");
    assert.equal(init?.method, "GET");
    return Response.json({ canProceed: false, reason: "destination_missing" });
  });
  assert.equal(calls, 1);
  assert.deepEqual(result, { canProceed: false, reason: "destination_missing" });
  assert.equal(planningReadinessMessage(result), "请先在上方添加目的地。");
});

test("client rejects invalid success payloads and failed HTTP responses", async () => {
  await assert.rejects(() => requestPlanningReadiness("trip-id", async () => Response.json({ canProceed: true })));
  await assert.rejects(() => requestPlanningReadiness("trip-id", async () => new Response(null, { status: 404 })));
});

test("UI messages distinguish matched but unconfirmed destination from explicit selection", () => {
  assert.match(planningReadinessMessage({ canProceed: true, destination: "selected" }), /已选定/);
  assert.match(planningReadinessMessage({ canProceed: true, destination: "resolved" }), /尚未作为你的确认地点保存/);
  for (const reason of ["destination_missing", "destination_ambiguous", "destination_unresolved", "provider_error"] as const) {
    assert.ok(planningReadinessMessage({ canProceed: false, reason }).length > 0);
  }
});

test("only an attempted, current destination_missing result highlights Destination", () => {
  const missing = { canProceed: false, reason: "destination_missing" } as const;
  const key = JSON.stringify({ state: "missing" });
  assert.equal(shouldHighlightMissingDestination(null, key), false);
  assert.equal(shouldHighlightMissingDestination({ destinationKey: key, result: missing }, key), true);
  assert.equal(shouldHighlightMissingDestination({ destinationKey: key, result: missing }, "updated-destination"), false);
  assert.equal(shouldHighlightMissingDestination({ destinationKey: key, result: {
    canProceed: false, reason: "destination_ambiguous",
  } }, key), false);
  assert.equal(shouldHighlightMissingDestination({ destinationKey: key, result: {
    canProceed: true, destination: "selected",
  } }, key), false);
});

test("Generate plan is offered once the destination names a place, not while it is only a province", () => {
  assert.equal(canRequestPlanGeneration(tripState), false);
  // 「我想去海南」 leaves a province with nothing chosen inside it: there is no plan to
  // generate yet, and a button that only ever answers 「范围还比较大」 is worse than none.
  assert.equal(canRequestPlanGeneration({ ...tripState, destination: {
    state: "approximate", value: "海南省", source: "user",
    areas: [{ province: "海南省", places: [] }],
  } }), false);
  assert.equal(canRequestPlanGeneration({ ...tripState, destination: {
    state: "known", value: "海南省 三亚市", source: "user",
    areas: [{ province: "海南省", places: ["三亚市"] }],
  } }), true);
  // One chosen place is enough; the other province being still open does not undo it.
  assert.equal(canRequestPlanGeneration({ ...tripState, destination: {
    state: "known", value: "四川省 稻城县 · 云南省", source: "user",
    areas: [{ province: "四川省", places: ["稻城县"] }, { province: "云南省", places: [] }],
  } }), true);
});

test("a destination without areas is judged by its own certainty", () => {
  // Free text and rows written before areas existed have only `value`. A known one
  // is a place the endpoint can answer for; an unsettled one is not worth the click.
  assert.equal(canRequestPlanGeneration({ ...tripState, destination: {
    state: "known", value: "二世谷", source: "user",
  } }), true);
  for (const state of ["approximate", "ambiguous"] as const) {
    assert.equal(canRequestPlanGeneration({ ...tripState, destination: {
      state, value: "北海道附近", source: "user",
    } }), false);
  }
});
