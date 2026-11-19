import assert from "node:assert/strict";
import test from "node:test";

import { defaultProviderLimits, providerLimitsFrom } from "./provider-limits";

test("limits come from .env.local in yuan and whole numbers, with the agreed defaults (1.2113)", () => {
  assert.deepEqual(providerLimitsFrom({}), {
    variflightFenPerPlan: 200, variflightFenPerDay: 2_000, railSearchesPerPlan: 8, railRequestsPerDay: 100, bochaCallsPerDay: 500, kimiSearchesPerDay: 500,
  });
  assert.deepEqual(providerLimitsFrom({
    VARIFLIGHT_MAX_YUAN_PER_PLAN: "1.5", VARIFLIGHT_MAX_YUAN_PER_DAY: " 10 ", RAIL_MAX_SEARCHES_PER_PLAN: "6", RAIL_MAX_REQUESTS_PER_DAY: "60",
    BOCHA_MAX_CALLS_PER_DAY: "300", KIMI_MAX_SEARCHES_PER_DAY: "80",
  }), { variflightFenPerPlan: 150, variflightFenPerDay: 1_000, railSearchesPerPlan: 6, railRequestsPerDay: 60, bochaCallsPerDay: 300, kimiSearchesPerDay: 80 });
});

test("a value that is not a positive amount keeps the default", () => {
  const limits = providerLimitsFrom({ VARIFLIGHT_MAX_YUAN_PER_PLAN: "two", VARIFLIGHT_MAX_YUAN_PER_DAY: "-1", RAIL_MAX_SEARCHES_PER_PLAN: "2.5", RAIL_MAX_REQUESTS_PER_DAY: "0" });
  assert.deepEqual(limits, defaultProviderLimits);
});
