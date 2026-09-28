import assert from "node:assert/strict";
import test from "node:test";

import type { LocationCandidate } from "@/domain/location/location";
import type { TripState } from "@/domain/trip-state/trip-state";
import type { WorkspaceConversationInterpretation } from "@/domain/trip-state/workspace-conversation";
import { resolveWorkspaceTurn } from "./workspace-turn-branch";

const missingState: TripState = {
  name: { state: "missing" }, origin: { state: "missing" }, destination: { state: "missing" },
  startDate: { state: "missing" }, endDate: { state: "missing" },
  duration: { state: "missing" }, transportPreference: { state: "missing" },
};
const interpretation: WorkspaceConversationInterpretation = {
  intent: "question", presentationIntent: "none", changes: [], reply: "模型自己那句话。",
};
const candidate: LocationCandidate = {
  providerId: "amap:1", name: "潮州", region: "广东省", address: "广东省潮州市",
  longitude: 116.6, latitude: 23.66, coordinateSystem: "GCJ-02",
};

function resolve(overrides: Partial<Parameters<typeof resolveWorkspaceTurn>[0]> = {}) {
  return resolveWorkspaceTurn({
    interpretation, recommendationReply: null, disambiguationResult: null,
    destinationExpression: null, tripState: missingState, resolution: null, persistedPatch: null,
    ...overrides,
  });
}

test("cards win the turn, and their reply is the text shown above them", () => {
  const turn = resolve({ recommendationReply: "结合你说的，看看这几个方向。" });
  assert.equal(turn.branch, "destination_recommendations");
  assert.equal(turn.reply, "结合你说的，看看这几个方向。");
});

test("an over-broad expression is narrowed, and the narrowing outranks the resolution reply", () => {
  const turn = resolve({
    destinationExpression: "潮汕",
    disambiguationResult: { status: "verified", candidates: [candidate] },
  });
  assert.equal(turn.branch, "destination_narrowing");
  assert.match(turn.reply, /「潮汕」范围比较大/);
});

test("a TripState turn is a Journey update and keeps the model's own reply", () => {
  const turn = resolve({
    interpretation: { ...interpretation, intent: "trip_state_update",
      changes: [{ field: "duration", state: "known", value: "三天" }] },
    persistedPatch: { duration: { state: "known", value: "三天", source: "user" } },
  });
  assert.equal(turn.branch, "journey_update");
  assert.equal(turn.reply, interpretation.reply);
});

test("questions, unclear updates, and 闲聊 share the one route the prompt alone steers", () => {
  for (const intent of ["question", "unclear_update_intent"] as const) {
    const turn = resolve({ interpretation: { ...interpretation, intent } });
    assert.equal(turn.branch, "conversation");
    assert.equal(turn.reply, interpretation.reply);
  }
});

test("a provider-side ambiguous destination is answered even though it has no branch of its own", () => {
  // The model thought the destination was settled; only the provider found it broad.
  const turn = resolve({
    interpretation: { ...interpretation, intent: "trip_state_update",
      changes: [{ field: "destination", state: "known", value: "潮汕" }] },
    tripState: { ...missingState, destination: { state: "known", value: "潮汕", source: "user" } },
    resolution: { status: "ambiguous", candidates: [candidate, { ...candidate, providerId: "amap:2", name: "汕头" }] },
  });
  assert.equal(turn.branch, "journey_update");
  assert.match(turn.reply, /我找到几个可能的地点/);
});
