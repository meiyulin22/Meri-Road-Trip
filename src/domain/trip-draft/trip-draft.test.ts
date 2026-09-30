import assert from "node:assert/strict";
import test from "node:test";

import { validateTripDraft } from "./trip-draft";

function createEmptyModelDraft() {
  return {
    name: { state: "missing", value: null },
    origin: { state: "missing", value: null },
    destinationEdit: { operation: "none" },
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
  assert.deepEqual(draft.destinationEdit, { operation: "none" });
});

test("represents a supplied origin as known", () => {
  const draft = validateTripDraft({
    ...createEmptyModelDraft(),
    origin: { state: "known", value: "大连" },
    destinationEdit: { operation: "set", places: ["云南"], broadRegion: null },
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
    destinationEdit: { operation: "set", places: ["二世谷", "富良野"], broadRegion: null },
  });

  assert.deepEqual(draft.destinationEdit, { operation: "set", places: ["二世谷", "富良野"], broadRegion: null });
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
