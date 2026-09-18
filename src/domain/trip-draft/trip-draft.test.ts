import assert from "node:assert/strict";
import test from "node:test";

import { validateTripDraft } from "./trip-draft";

function createEmptyModelDraft() {
  return {
    name: { state: "missing", value: null },
    origin: { state: "missing", value: null },
    destination: { state: "missing", value: null },
    startDate: { state: "missing", value: null },
    endDate: { state: "missing", value: null },
    duration: { state: "missing", value: null },
    transportPreference: { state: "missing", value: null },
  };
}

test("preserves a broad seasonal expression as approximate", () => {
  const draft = validateTripDraft({
    ...createEmptyModelDraft(),
    startDate: { state: "approximate", value: "今年冬天" },
  });

  assert.deepEqual(draft.startDate, {
    state: "approximate",
    value: "今年冬天",
  });
  assert.deepEqual(draft.destination, { state: "missing" });
});

test("represents a supplied origin as known", () => {
  const draft = validateTripDraft({
    ...createEmptyModelDraft(),
    origin: { state: "known", value: "大连" },
    destination: { state: "known", value: "云南" },
    duration: { state: "known", value: "一周" },
  });

  assert.deepEqual(draft.origin, { state: "known", value: "大连" });
});

test("preserves an approximate date expression without inventing precision", () => {
  const draft = validateTripDraft({
    ...createEmptyModelDraft(),
    startDate: { state: "approximate", value: "十月底左右" },
  });

  assert.deepEqual(draft.startDate, {
    state: "approximate",
    value: "十月底左右",
  });
});

test("preserves multiple destination alternatives as ambiguous", () => {
  const draft = validateTripDraft({
    ...createEmptyModelDraft(),
    destination: { state: "ambiguous", value: "二世谷或者富良野都行" },
  });

  assert.deepEqual(draft.destination, {
    state: "ambiguous",
    value: "二世谷或者富良野都行",
  });
});

test("preserves an approximate duration in its own field", () => {
  const draft = validateTripDraft({
    ...createEmptyModelDraft(),
    duration: { state: "approximate", value: "大概一周" },
  });

  assert.deepEqual(draft.duration, {
    state: "approximate",
    value: "大概一周",
  });
});
