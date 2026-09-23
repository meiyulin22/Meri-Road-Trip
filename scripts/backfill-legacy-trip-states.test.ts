import assert from "node:assert/strict";
import test from "node:test";

import { stateFromLegacyTrip } from "./backfill-legacy-trip-states";

test("preserves legacy text and exact dates without asserting location certainty", () => {
  const state = stateFromLegacyTrip({
    id: "trip_1",
    name: "今年冬天想找个地方滑雪",
    origin: null,
    destination: "Neon PostgreSQL Verification",
    startDate: "2026-10-10",
    endDate: "2026-10-11",
  });

  assert.deepEqual(state.name, {
    state: "known", value: "今年冬天想找个地方滑雪", source: "system",
  });
  assert.deepEqual(state.origin, { state: "missing" });
  assert.deepEqual(state.destination, {
    state: "approximate", value: "Neon PostgreSQL Verification", source: "system",
  });
  assert.deepEqual(state.startDate, {
    state: "known", value: "2026-10-10", source: "system",
  });
  assert.deepEqual(state.endDate, {
    state: "known", value: "2026-10-11", source: "system",
  });
  assert.deepEqual(state.duration, { state: "missing" });
  assert.deepEqual(state.transportPreference, { state: "missing" });
});

test("does not invent a destination, dates, or preferences for an incomplete idea", () => {
  const state = stateFromLegacyTrip({
    id: "trip_2",
    name: "今年冬天想找个地方滑雪",
    origin: null,
    destination: null,
    startDate: null,
    endDate: null,
  });

  for (const field of ["origin", "destination", "startDate", "endDate", "duration", "transportPreference"] as const) {
    assert.deepEqual(state[field], { state: "missing" });
  }
});
