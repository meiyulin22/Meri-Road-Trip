import assert from "node:assert/strict";
import test from "node:test";

import type { TripDraft } from "@/domain/trip-draft/trip-draft";

import {
  applyTemporaryWorkspaceConversationInterpretation,
  applyTemporaryTripStateEdit,
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

async function resetWorkspace(): Promise<void> {
  clearTemporaryTripWorkspace();
  await setTemporaryTripWorkspace(draft, "今年冬天想找个地方滑雪");
}

test("creates authoritative TripState when the temporary Workspace starts", async () => {
  await resetWorkspace();

  assert.deepEqual(getTemporaryTripWorkspace(), {
    tripState: {
      name: { state: "known", value: "冬季滑雪之旅", source: "system" },
      origin: { state: "missing" },
      destination: {
        state: "ambiguous",
        value: "二世谷或者富良野",
        source: "user",
      },
      startDate: {
        state: "approximate",
        value: "今年冬天",
        source: "user",
      },
      endDate: { state: "missing" },
      duration: {
        state: "approximate",
        value: "大概一周",
        source: "user",
      },
      transportPreference: { state: "missing" },
    },
    initialMessage: "今年冬天想找个地方滑雪",
  });

  clearTemporaryTripWorkspace();
  assert.equal(getTemporaryTripWorkspace(), null);
});

test("direct edit marks a known field as user-sourced", async () => {
  await resetWorkspace();
  await applyTemporaryTripStateEdit({
    type: "confirm",
    field: "name",
    value: "北海道雪季慢旅行",
  });

  assert.deepEqual(getTemporaryTripWorkspace()?.tripState.name, {
    state: "known",
    value: "北海道雪季慢旅行",
    source: "user",
  });
});

test("direct edit preserves approximate certainty and exact natural language", async () => {
  await resetWorkspace();
  await applyTemporaryTripStateEdit({
    type: "confirm",
    field: "startDate",
    value: "十月底",
  });

  assert.deepEqual(getTemporaryTripWorkspace()?.tripState.startDate, {
    state: "approximate",
    value: "十月底",
    source: "user",
  });
});

test("direct edit preserves ambiguous certainty", async () => {
  await resetWorkspace();
  await applyTemporaryTripStateEdit({
    type: "confirm",
    field: "destination",
    value: "长野或者北海道",
  });

  assert.deepEqual(getTemporaryTripWorkspace()?.tripState.destination, {
    state: "ambiguous",
    value: "长野或者北海道",
    source: "user",
  });
});

test("entering a previously missing field establishes a user-known value", async () => {
  await resetWorkspace();
  await applyTemporaryTripStateEdit({
    type: "confirm",
    field: "origin",
    value: "大连",
  });

  assert.deepEqual(getTemporaryTripWorkspace()?.tripState.origin, {
    state: "known",
    value: "大连",
    source: "user",
  });
});

test("clearing a field produces missing without source metadata", async () => {
  await resetWorkspace();
  await applyTemporaryTripStateEdit({
    type: "confirm",
    field: "duration",
    value: "   ",
  });

  const duration = getTemporaryTripWorkspace()?.tripState.duration;
  assert.deepEqual(duration, { state: "missing" });
  assert.equal(duration && "source" in duration, false);
});

test("cancelling does not mutate TripState", async () => {
  await resetWorkspace();
  const beforeCancel = getTemporaryTripWorkspace()?.tripState;

  await applyTemporaryTripStateEdit({ type: "cancel" });

  assert.strictEqual(getTemporaryTripWorkspace()?.tripState, beforeCancel);
});

test("editing one field leaves unrelated fields unchanged", async () => {
  await resetWorkspace();
  const beforeEdit = getTemporaryTripWorkspace()?.tripState;

  await applyTemporaryTripStateEdit({
    type: "confirm",
    field: "origin",
    value: "上海",
  });

  const afterEdit = getTemporaryTripWorkspace()?.tripState;
  assert.strictEqual(afterEdit?.destination, beforeEdit?.destination);
  assert.strictEqual(afterEdit?.startDate, beforeEdit?.startDate);
  assert.strictEqual(
    afterEdit?.transportPreference,
    beforeEdit?.transportPreference,
  );
});

test("accepts only an existing transport preference enum value", async () => {
  await resetWorkspace();
  await applyTemporaryTripStateEdit({
    type: "confirm",
    field: "transportPreference",
    value: "public_transport",
  });

  assert.deepEqual(
    getTemporaryTripWorkspace()?.tripState.transportPreference,
    {
      state: "known",
      value: "public_transport",
      source: "user",
    },
  );
  await assert.rejects(
    async () =>
      applyTemporaryTripStateEdit({
        type: "confirm",
        field: "transportPreference",
        value: "teleport",
      }),
    /Invalid transport preference/,
  );
});

test("applies a validated conversation update through the same TripState", async () => {
  await resetWorkspace();
  const beforeUpdate = getTemporaryTripWorkspace()?.tripState;

  const applied = await applyTemporaryWorkspaceConversationInterpretation({
    intent: "trip_state_update",
    changes: [
      { field: "destination", state: "known", value: "富良野" },
    ],
    reply: "好的，目的地改成富良野。",
  });

  const afterUpdate = getTemporaryTripWorkspace()?.tripState;
  assert.equal(applied, true);
  assert.deepEqual(afterUpdate?.destination, {
    state: "known",
    value: "富良野",
    source: "user",
  });
  assert.strictEqual(afterUpdate?.origin, beforeUpdate?.origin);
  assert.strictEqual(afterUpdate?.startDate, beforeUpdate?.startDate);
});

test("question and unclear conversation intents leave TripState unchanged", async () => {
  await resetWorkspace();
  const beforeQuestion = getTemporaryTripWorkspace()?.tripState;

  assert.equal(
    await applyTemporaryWorkspaceConversationInterpretation({
      intent: "question",
      changes: [],
      reply: "这个问题需要接入 Research 后再查。",
    }),
    false,
  );
  assert.strictEqual(getTemporaryTripWorkspace()?.tripState, beforeQuestion);

  assert.equal(
    await applyTemporaryWorkspaceConversationInterpretation({
      intent: "unclear_update_intent",
      changes: [],
      reply: "你是想改成富良野，还是先比较一下？",
    }),
    false,
  );
  assert.strictEqual(getTemporaryTripWorkspace()?.tripState, beforeQuestion);
});
