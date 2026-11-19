import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { logger } from "@/platform/observability/logger";

import { createDailyBudget } from "./daily-budget";
import type { Gate } from "./request-pacer";

const straightThrough: Gate = { run: (task) => task(), pause: () => {} };

test("reaching the day's limit is logged once, in the provider's own units (1.2113)", async () => {
  const warn = mock.method(logger, "warn", () => {});
  try {
    const now = Date.parse("2026-11-19T08:00:00Z");
    const budget = createDailyBudget({ intervalMs: 0, dailyUnits: 50, pauseMs: 1_000 }, {
      file: null, gate: straightThrough, clock: { now: () => now, sleep: async () => {} },
      label: { provider: "VariFlight", units: (fen) => `¥${(fen / 100).toFixed(2)}` },
    });
    assert.equal((await budget.run(25, async () => 1)).ok, true);
    assert.equal((await budget.run(25, async () => 2)).ok, true);
    assert.deepEqual(await budget.run(25, async () => 3), { ok: false, reason: "daily_limit" });
    assert.deepEqual(await budget.run(25, async () => 4), { ok: false, reason: "daily_limit" });
    assert.equal(warn.mock.callCount(), 1);
    const [fields, message] = warn.mock.calls[0].arguments as unknown as [Record<string, unknown>, string];
    assert.deepEqual(fields, { provider: "VariFlight", date: "2026-11-19", used: "¥0.50", limit: "¥0.50", refused: "¥0.25" });
    assert.equal(message, "VariFlight daily limit reached: ¥0.50 used of ¥0.50 on 2026-11-19; no more calls until 00:00 Beijing time");
  } finally {
    warn.mock.restore();
  }
});
