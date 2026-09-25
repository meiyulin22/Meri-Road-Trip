import assert from "node:assert/strict";
import test from "node:test";

import type { TripDraft } from "@/domain/trip-draft/trip-draft";
import {
  applyTripStatePatch,
  initializeTripState,
} from "@/domain/trip-state/trip-state";
import {
  createTripStatePatchFromInterpretation,
  InvalidWorkspaceConversationInterpretationError,
  validateWorkspaceConversationInterpretation,
} from "@/domain/trip-state/workspace-conversation";

const draft: TripDraft = {
  name: { state: "known", value: "二世谷滑雪" },
  origin: { state: "missing" },
  destination: { state: "known", value: "二世谷" },
  startDate: { state: "missing" },
  endDate: { state: "missing" },
  duration: { state: "missing" },
  transportPreference: { state: "missing" },
};

function applyInterpretation(value: unknown) {
  const state = initializeTripState(draft);
  const interpretation = validateWorkspaceConversationInterpretation(value);
  const patch = createTripStatePatchFromInterpretation(interpretation);
  return { state, patch, nextState: patch && applyTripStatePatch(state, patch) };
}

test("accepts a normal non-empty reply", () => {
  const interpretation = validateWorkspaceConversationInterpretation({
    intent: "question",
    changes: [],
    reply: "这个问题需要接入 Research 后再查。",
  });

  assert.equal(interpretation.reply, "这个问题需要接入 Research 后再查。");
});

test("rejects empty and whitespace-only replies", () => {
  for (const reply of ["", "   "]) {
    assert.throws(
      () =>
        validateWorkspaceConversationInterpretation({
          intent: "question",
          changes: [],
          reply,
        }),
      /reply must be a non-empty string/,
    );
  }
});

test("clear destination update changes only destination and assigns user source", () => {
  const { state, nextState } = applyInterpretation({
    intent: "trip_state_update",
    changes: [{ field: "destination", state: "known", value: "富良野" }],
    reply: "好的，目的地改成富良野。",
  });

  assert.deepEqual(nextState?.destination, {
    state: "known",
    value: "富良野",
    source: "user",
  });
  assert.strictEqual(nextState?.name, state.name);
  assert.strictEqual(nextState?.origin, state.origin);
  assert.strictEqual(nextState?.startDate, state.startDate);
});

test("a conversational destination update drops the previous explicit selection", () => {
  const state = applyTripStatePatch(initializeTripState(draft), {
    destination: {
      state: "known", value: "二世谷", source: "user",
      selection: { provider: "amap", region: "北海道" },
    },
  });
  const interpretation = validateWorkspaceConversationInterpretation({
    intent: "trip_state_update",
    changes: [{ field: "destination", state: "known", value: "富良野" }],
    reply: "好的。",
  });
  const patch = createTripStatePatchFromInterpretation(interpretation);
  assert.ok(patch);
  assert.deepEqual(applyTripStatePatch(state, patch).destination, {
    state: "known", value: "富良野", source: "user",
  });
});

test("clear origin update changes origin", () => {
  const { nextState } = applyInterpretation({
    intent: "trip_state_update",
    changes: [{ field: "origin", state: "known", value: "大连" }],
    reply: "记下了，从大连出发。",
  });

  assert.deepEqual(nextState?.origin, {
    state: "known",
    value: "大连",
    source: "user",
  });
});

test("approximate date update preserves exact natural language", () => {
  const { nextState } = applyInterpretation({
    intent: "trip_state_update",
    changes: [
      { field: "startDate", state: "approximate", value: "十一月底左右" },
    ],
    reply: "时间改成十一月底左右。",
  });

  assert.deepEqual(nextState?.startDate, {
    state: "approximate",
    value: "十一月底左右",
    source: "user",
  });
});

test("ambiguous destination update preserves both alternatives", () => {
  const { nextState } = applyInterpretation({
    intent: "trip_state_update",
    changes: [
      {
        field: "destination",
        state: "ambiguous",
        value: "二世谷或者富良野",
      },
    ],
    reply: "两个目的地都先保留。",
  });

  assert.deepEqual(nextState?.destination, {
    state: "ambiguous",
    value: "二世谷或者富良野",
    source: "user",
  });
});

test("question and destination mention produce no TripState patch", () => {
  const { patch } = applyInterpretation({
    intent: "question",
    changes: [],
    reply: "这个问题需要接入 Research 后再查。",
  });

  assert.equal(patch, null);
});

test("unclear update intent produces no TripState patch", () => {
  const { patch } = applyInterpretation({
    intent: "unclear_update_intent",
    changes: [],
    reply: "你是想改成富良野，还是先比较一下？",
  });

  assert.equal(patch, null);
});

test("model output cannot control source", () => {
  assert.throws(
    () =>
      validateWorkspaceConversationInterpretation({
        intent: "trip_state_update",
        changes: [
          {
            field: "destination",
            state: "known",
            value: "富良野",
            source: "system",
          },
        ],
        reply: "已更新。",
      }),
    InvalidWorkspaceConversationInterpretationError,
  );
});

test("invalid fields are rejected", () => {
  assert.throws(
    () =>
      validateWorkspaceConversationInterpretation({
        intent: "trip_state_update",
        changes: [{ field: "weather", state: "known", value: "晴" }],
        reply: "已更新。",
      }),
    InvalidWorkspaceConversationInterpretationError,
  );
});

test("transport preference remains constrained to the existing enum", () => {
  assert.throws(
    () =>
      validateWorkspaceConversationInterpretation({
        intent: "trip_state_update",
        changes: [
          {
            field: "transportPreference",
            state: "known",
            value: "teleport",
          },
        ],
        reply: "已更新。",
      }),
    /supported value/,
  );

  const { nextState } = applyInterpretation({
    intent: "trip_state_update",
    changes: [
      {
        field: "transportPreference",
        state: "known",
        value: "public_transport",
      },
    ],
    reply: "交通偏好改成公共交通。",
  });
  assert.deepEqual(nextState?.transportPreference, {
    state: "known",
    value: "public_transport",
    source: "user",
  });
});
