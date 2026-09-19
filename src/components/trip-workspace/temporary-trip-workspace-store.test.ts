import assert from "node:assert/strict";
import test from "node:test";

import type { TripDraft } from "@/domain/trip-draft/trip-draft";

import {
  applyTemporaryTripDraftEdit,
  clearTemporaryTripWorkspace,
  getTemporaryTripWorkspace,
  setTemporaryTripWorkspace,
} from "./temporary-trip-workspace-store";

const draft: TripDraft = {
  name: { state: "known", value: "冬季滑雪之旅" },
  origin: { state: "missing" },
  destination: { state: "ambiguous", value: "二世谷或者富良野" },
  startDate: { state: "approximate", value: "今年冬天" },
  endDate: { state: "missing" },
  duration: { state: "approximate", value: "大概一周" },
  transportPreference: { state: "missing" },
};

function resetWorkspace(): void {
  clearTemporaryTripWorkspace();
  setTemporaryTripWorkspace(draft, "今年冬天想找个地方滑雪");
}

test("keeps a TripDraft in temporary client state until it is cleared", () => {
  resetWorkspace();

  assert.deepEqual(getTemporaryTripWorkspace(), {
    draft,
    initialMessage: "今年冬天想找个地方滑雪",
  });

  clearTemporaryTripWorkspace();
  assert.equal(getTemporaryTripWorkspace(), null);
});

test("replaces a known field with the exact confirmed text", () => {
  resetWorkspace();
  applyTemporaryTripDraftEdit({
    type: "confirm",
    field: "name",
    value: "北海道雪季慢旅行",
  });

  assert.deepEqual(getTemporaryTripWorkspace()?.draft.name, {
    state: "known",
    value: "北海道雪季慢旅行",
  });
});

test("turns an approximate field into known without normalizing natural language", () => {
  resetWorkspace();
  applyTemporaryTripDraftEdit({
    type: "confirm",
    field: "startDate",
    value: "10月25日",
  });

  assert.deepEqual(getTemporaryTripWorkspace()?.draft.startDate, {
    state: "known",
    value: "10月25日",
  });
});

test("turns an ambiguous field into known when the user chooses a value", () => {
  resetWorkspace();
  applyTemporaryTripDraftEdit({
    type: "confirm",
    field: "destination",
    value: "二世谷",
  });

  assert.deepEqual(getTemporaryTripWorkspace()?.draft.destination, {
    state: "known",
    value: "二世谷",
  });
});

test("turns a missing field into known when the user enters text", () => {
  resetWorkspace();
  applyTemporaryTripDraftEdit({
    type: "confirm",
    field: "origin",
    value: "大连",
  });

  assert.deepEqual(getTemporaryTripWorkspace()?.draft.origin, {
    state: "known",
    value: "大连",
  });
});

test("clearing a field confirms it as missing", () => {
  resetWorkspace();
  applyTemporaryTripDraftEdit({
    type: "confirm",
    field: "duration",
    value: "   ",
  });

  assert.deepEqual(getTemporaryTripWorkspace()?.draft.duration, {
    state: "missing",
  });
});

test("cancelling does not mutate the draft", () => {
  resetWorkspace();
  const beforeCancel = getTemporaryTripWorkspace()?.draft;

  applyTemporaryTripDraftEdit({ type: "cancel" });

  assert.deepEqual(getTemporaryTripWorkspace()?.draft, beforeCancel);
});

test("editing one field leaves unrelated fields unchanged", () => {
  resetWorkspace();
  const beforeEdit = getTemporaryTripWorkspace()?.draft;

  applyTemporaryTripDraftEdit({
    type: "confirm",
    field: "origin",
    value: "上海",
  });

  const afterEdit = getTemporaryTripWorkspace()?.draft;
  assert.deepEqual(afterEdit?.destination, beforeEdit?.destination);
  assert.deepEqual(afterEdit?.startDate, beforeEdit?.startDate);
  assert.deepEqual(afterEdit?.transportPreference, beforeEdit?.transportPreference);
});

test("accepts only an existing transport preference enum value", () => {
  resetWorkspace();
  applyTemporaryTripDraftEdit({
    type: "confirm",
    field: "transportPreference",
    value: "public_transport",
  });

  assert.deepEqual(getTemporaryTripWorkspace()?.draft.transportPreference, {
    state: "known",
    value: "public_transport",
  });
  assert.throws(
    () =>
      applyTemporaryTripDraftEdit({
        type: "confirm",
        field: "transportPreference",
        value: "teleport",
      }),
    /Invalid transport preference/,
  );
});
