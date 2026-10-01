import assert from "node:assert/strict";
import test from "node:test";

import { planningReadinessMessage, requestPlanningReadiness } from "./planning-readiness-model";

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
  assert.equal(planningReadinessMessage(result), "请先添加目的地。");
});

test("client rejects invalid success payloads and failed HTTP responses", async () => {
  await assert.rejects(() => requestPlanningReadiness("trip-id", async () => Response.json({ canProceed: true })));
  await assert.rejects(() => requestPlanningReadiness("trip-id", async () => new Response(null, { status: 404 })));
});

test("UI messages distinguish selected, missing and old unverified records",()=>{
 assert.match(planningReadinessMessage({canProceed:true,destination:"selected"}),/已选定/);
 for(const reason of ["destination_missing","destination_unverified"] as const)assert.ok(planningReadinessMessage({canProceed:false,reason}));
});
