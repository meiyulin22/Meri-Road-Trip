import assert from "node:assert/strict";
import test from "node:test";

import { limitFailures, runFailure } from "./plan-draft-model";

test("a run Kimi stopped at a site limit reads as that limit, with no retry offered (step 2)", () => {
  assert.equal(runFailure("daily_quota"), "daily_quota");
  assert.equal(runFailure("paid_calls_paused"), "paid_calls_paused");
  assert.equal(runFailure("planner_unavailable"), "unavailable");
  assert.equal(runFailure(null), "failed");
  assert.deepEqual([...limitFailures].sort(), ["address_runs", "daily_quota", "daily_runs", "guest_runs", "paid_calls_paused"]);
});
