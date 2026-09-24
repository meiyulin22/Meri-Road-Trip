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

test("initializes a default name from a known destination", () => {
  const state = initializeTripState({
    ...draft,
    name: { state: "missing" },
    destination: { state: "known", value: "东京" },
  });

  assert.deepEqual(state.name, {
    state: "known",
    value: "东京之旅",
    source: "system",
  });
});

test("keeps the name missing when the initial destination is not known", () => {
  for (const destination of [
    { state: "missing" },
    { state: "approximate", value: "日本附近" },
    { state: "ambiguous", value: "东京或大阪" },
  ] as const) {
    const state = initializeTripState({
      ...draft,
      name: { state: "missing" },
      destination,
    });
    assert.deepEqual(state.name, { state: "missing" });
  }
});

test("generates a default name when a later destination becomes known", () => {
  const state = initializeTripState({
    ...draft,
    name: { state: "missing" },
    destination: { state: "missing" },
  });
  const nextState = applyTripStatePatch(state, {
    destination: { state: "known", value: "东京", source: "user" },
  });

  assert.deepEqual(nextState.name, {
    state: "known",
    value: "东京之旅",
    source: "system",
  });
  assert.deepEqual(state.name, { state: "missing" });
});

test("does not generate from approximate or ambiguous destination patches", () => {
  const state = initializeTripState({
    ...draft,
    name: { state: "missing" },
    destination: { state: "missing" },
  });

  for (const destination of [
    { state: "approximate", value: "日本附近", source: "user" },
    { state: "ambiguous", value: "东京或大阪", source: "user" },
    { state: "missing" },
  ] as const) {
    assert.deepEqual(
      applyTripStatePatch(state, { destination }).name,
      { state: "missing" },
    );
  }
});

test("an explicit name patch wins over default generation", () => {
  const state = initializeTripState({
    ...draft,
    name: { state: "missing" },
    destination: { state: "missing" },
  });
  const destination = { state: "known", value: "东京", source: "user" } as const;

  assert.deepEqual(
    applyTripStatePatch(state, {
      name: { state: "known", value: "我的秋季旅行", source: "user" },
      destination,
    }).name,
    { state: "known", value: "我的秋季旅行", source: "user" },
  );
  assert.deepEqual(
    applyTripStatePatch(state, { name: { state: "missing" }, destination }).name,
    { state: "missing" },
  );
});

test("preserves every existing nonmissing name when destination changes", () => {
  for (const source of ["user", "system"] as const) {
    const name = { state: "known", value: "我的旅行", source } as const;
    const state = initializeTripState({
      ...draft,
      name: { state: "missing" },
      destination: { state: "missing" },
    });
    const nextState = applyTripStatePatch({ ...state, name }, {
      destination: { state: "known", value: "东京", source: "user" },
    });
    assert.strictEqual(nextState.name, name);
  }
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
