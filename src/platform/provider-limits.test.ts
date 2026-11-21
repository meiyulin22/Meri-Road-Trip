import assert from "node:assert/strict";
import test from "node:test";

import { defaultProviderLimits, paidCallsEnabled, providerLimitsFrom } from "./provider-limits";

test("limits come from .env.local in yuan and whole numbers, with the agreed defaults (1.2113)", () => {
  assert.deepEqual(providerLimitsFrom({}), {
    variflightFenPerPlan: 200, variflightFenPerDay: 2_000, railSearchesPerPlan: 8, railRequestsPerDay: 100, bochaCallsPerDay: 500, kimiSearchesPerDay: 450,
    kimiFenPerDay: 4_000, planRunsPerDay: 30, planRunsPerGuestPerDay: 3, planRunsPerIpPerDay: 6, chatTurnsPerGuestPerHour: 30, kimiRequestsPerIpPerHour: 120,
    openMeteoCallsPerDay: 2_000, metNorwayCallsPerDay: 1_000, rollinggoCallsPerDay: 300,
  });
  assert.deepEqual(providerLimitsFrom({
    VARIFLIGHT_MAX_YUAN_PER_PLAN: "1.5", VARIFLIGHT_MAX_YUAN_PER_DAY: " 10 ", RAIL_MAX_SEARCHES_PER_PLAN: "6", RAIL_MAX_REQUESTS_PER_DAY: "60",
    BOCHA_MAX_CALLS_PER_DAY: "300", KIMI_MAX_SEARCHES_PER_DAY: "80", KIMI_MAX_YUAN_PER_DAY: "25.5", PLAN_RUNS_PER_DAY: "10",
    OPEN_METEO_MAX_CALLS_PER_DAY: "500",
  }), {
    variflightFenPerPlan: 150, variflightFenPerDay: 1_000, railSearchesPerPlan: 6, railRequestsPerDay: 60, bochaCallsPerDay: 300, kimiSearchesPerDay: 80,
    kimiFenPerDay: 2_550, planRunsPerDay: 10, planRunsPerGuestPerDay: 3, planRunsPerIpPerDay: 6, chatTurnsPerGuestPerHour: 30, kimiRequestsPerIpPerHour: 120,
    openMeteoCallsPerDay: 500, metNorwayCallsPerDay: 1_000, rollinggoCallsPerDay: 300,
  });
});

test("a value that is not a positive amount keeps the default", () => {
  const limits = providerLimitsFrom({ VARIFLIGHT_MAX_YUAN_PER_PLAN: "two", VARIFLIGHT_MAX_YUAN_PER_DAY: "-1", RAIL_MAX_SEARCHES_PER_PLAN: "2.5", RAIL_MAX_REQUESTS_PER_DAY: "0" });
  assert.deepEqual(limits, defaultProviderLimits);
});

test("only PAID_CALLS_ENABLED=false stops paid calls (step 2)", () => {
  assert.equal(paidCallsEnabled({}), true);
  assert.equal(paidCallsEnabled({ PAID_CALLS_ENABLED: "true" }), true);
  assert.equal(paidCallsEnabled({ PAID_CALLS_ENABLED: " False " }), false);
});
