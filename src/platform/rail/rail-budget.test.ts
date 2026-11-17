import assert from "node:assert/strict";
import test from "node:test";

import type { Gate } from "@/platform/http/request-pacer";

import { createRailBudget, railLimits } from "./rail-budget";

// The pacer is tested on its own; here every turn comes at once.
const straightThrough: Gate = { run: (task) => task(), pause: () => {} };

test("requests count against the day, and the day's limit refuses without running (1.2108)", async () => {
  let now = Date.parse("2026-11-17T08:00:00Z");
  const budget = createRailBudget({ file: null, gate: straightThrough, clock: { now: () => now, sleep: async () => {} } });
  let ran = 0;
  for (let index = 0; index < railLimits.dailyRequests / 2; index += 1) {
    assert.deepEqual(await budget.run(2, async () => { ran += 1; return ran; }), { ok: true, value: ran });
  }
  assert.deepEqual(await budget.run(2, async () => { ran += 1; return ran; }), { ok: false, reason: "daily_limit" });
  assert.equal(ran, railLimits.dailyRequests / 2);
  // A new day in Beijing starts the count again.
  now = Date.parse("2026-11-17T16:30:00Z");
  assert.equal((await budget.run(2, async () => "next day")).ok, true);
});

test("after a failure nothing is sent until the pause is over", async () => {
  let now = Date.parse("2026-11-17T08:00:00Z");
  const budget = createRailBudget({ file: null, gate: straightThrough, clock: { now: () => now, sleep: async () => {} } });
  budget.pause();
  let ran = false;
  assert.deepEqual(await budget.run(2, async () => { ran = true; }), { ok: false, reason: "paused" });
  assert.equal(ran, false);
  now += railLimits.pauseMs + 1;
  assert.equal((await budget.run(2, async () => true)).ok, true);
});
