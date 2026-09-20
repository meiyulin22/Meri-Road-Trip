import assert from "node:assert/strict";
import test from "node:test";

import type { TripDraft } from "@/domain/trip-draft/trip-draft";

import {
  applyTripStatePatch,
  initializeTripState,
  InvalidTripStateError,
  validateTripStatePatch,
  type TripStatePatch,
} from "./trip-state";

const draft: TripDraft = {
  name: { state: "known", value: "冬季滑雪之旅" },
  origin: { state: "known", value: "大连" },
  destination: { state: "ambiguous", value: "二世谷或者富良野" },
  startDate: { state: "approximate", value: "十月底" },
  endDate: { state: "missing" },
  duration: { state: "approximate", value: "大概一周" },
  transportPreference: { state: "known", value: "no_self_drive" },
};

test("initializes TripState without mutating TripDraft", () => {
  const originalDraft = structuredClone(draft);
  const state = initializeTripState(draft);

  assert.deepEqual(draft, originalDraft);
  assert.deepEqual(state.startDate, {
    state: "approximate",
    value: "十月底",
    source: "user",
  });
  assert.deepEqual(state.destination, {
    state: "ambiguous",
    value: "二世谷或者富良野",
    source: "user",
  });
  assert.deepEqual(state.endDate, { state: "missing" });
  assert.equal("source" in state.endDate, false);
});

test("uses the narrow system default for a TripDraft name with unknown provenance", () => {
  const state = initializeTripState(draft);

  assert.deepEqual(state.name, {
    state: "known",
    value: "冬季滑雪之旅",
    source: "system",
  });
});

test("applies a patch without changing or reconstructing unrelated fields", () => {
  const state = initializeTripState(draft);
  const patch: TripStatePatch = {
    startDate: {
      state: "approximate",
      value: "十月底左右",
      source: "user",
    },
  };
  const nextState = applyTripStatePatch(state, patch);

  assert.deepEqual(nextState.startDate, {
    state: "approximate",
    value: "十月底左右",
    source: "user",
  });
  assert.strictEqual(nextState.destination, state.destination);
  assert.strictEqual(nextState.duration, state.duration);
  assert.notEqual(state.startDate.state, "missing");
  if (state.startDate.state !== "missing") {
    assert.equal(state.startDate.value, "十月底");
  }
});

test("validates a focused external TripStatePatch", () => {
  assert.deepEqual(
    validateTripStatePatch({
      destination: {
        state: "ambiguous",
        value: "二世谷或者富良野",
        source: "user",
      },
    }),
    {
      destination: {
        state: "ambiguous",
        value: "二世谷或者富良野",
        source: "user",
      },
    },
  );
});

test("rejects empty and unknown TripStatePatch fields", () => {
  assert.throws(() => validateTripStatePatch({}), InvalidTripStateError);
  assert.throws(
    () => validateTripStatePatch({ weather: { state: "missing" } }),
    InvalidTripStateError,
  );
});
