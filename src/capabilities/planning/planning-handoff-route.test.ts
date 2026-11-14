import assert from "node:assert/strict";
import test from "node:test";

import { handlePlanningHandoffPost } from "./planning-handoff-handler";
import type { TripPreference } from "@/domain/plan/trip-preference";
import type { TripMessage } from "@/domain/trip-message/trip-message";
import type { TripState } from "@/domain/trip-state/trip-state";
import { TripNotFoundError } from "@/domain/trip/trip-errors";
import { requestPlanningHandoff } from "@/components/trip-workspace/planning-handoff-model";

const context = { referenceDate: "2026-11-10", timezone: "Asia/Shanghai", locale: "zh" } as const;
const tripState: TripState = {
  name: { state: "known", value: "云南之旅", source: "user" },
  origin: { state: "missing" },
  destination: {
    state: "known", source: "user",
    areas: [{ province: "云南省", places: [{ name: "大理白族自治州", spots: ["苍山"] }] }],
  },
  startDate: { state: "known", value: "2026-12-01", source: "user" },
  endDate: { state: "known", value: "2026-12-07", source: "system" },
  duration: { state: "known", value: "7天", source: "user" },
  transportPreference: { state: "missing" },
};
const message: TripMessage = {
  id: "message-id", tripId: "trip-id", role: "user", content: "带父母，少走台阶。还想去苍山。",
  createdAt: "2026-11-10T10:00:00.000Z",
};
const extracted = { messageId: message.id, quote: "少走台阶", label: "少爬台阶", kind: "walking" as const, createdAt: message.createdAt };
const removedBefore: TripPreference = {
  id: "removed-id", tripId: "trip-id", label: "不吃辣", kind: "diet", quote: "我不吃辣", source: "conversation",
  messageId: message.id, status: "removed", createdAt: "2026-11-09T10:00:00.000Z",
};
const addedOnPlanPage: TripPreference = {
  id: "added-id", tripId: "trip-id", label: "喜欢拍照", kind: "interests", quote: "喜欢拍照", source: "plan_page",
  messageId: null, status: "active", createdAt: "2026-11-10T11:00:00.000Z",
};
const oldExtraction: TripPreference = { ...removedBefore, id: "old-id", quote: "慢慢逛", label: "慢节奏", kind: "pace", status: "active" };
const unreachable = async (): Promise<never> => assert.fail("Dependency should not be called");

test("POST saves labelled preferences and hands the plan page the active ones", async () => {
  const replaced: TripPreference[] = [];
  const result = await requestPlanningHandoff("trip-id", async (url, init) => {
    assert.equal(url, "/api/trips/trip-id/planning-handoff");
    assert.equal(init?.method, "POST");
    assert.equal(init?.body, undefined);
    const response = await handlePlanningHandoffPost("trip-id", "owner-id", context, {
      async loadJourney(id, owner) {
        assert.equal(id, "trip-id");
        assert.equal(owner, "owner-id");
        return { tripState };
      },
      async listMessages(id, owner) {
        assert.equal(id, "trip-id");
        assert.equal(owner, "owner-id");
        return [message];
      },
      async extractPreferences(history) {
        assert.deepEqual(history, [message]);
        // The traveller removed 我不吃辣 earlier; extracting it again must not bring it back.
        return { preferenceStatus: "ready", preferences: [extracted, { ...extracted, quote: "我不吃辣", label: "不吃辣", kind: "diet" }] };
      },
      async listPreferences() {
        return [removedBefore, addedOnPlanPage, oldExtraction];
      },
      async replaceConversationPreferences(id, preferences) {
        assert.equal(id, "trip-id");
        replaced.push(...preferences);
      },
      newId: () => "new-id",
    });
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    return response;
  });
  const saved = { id: "new-id", label: "少爬台阶", kind: "walking", quote: "少走台阶", source: "conversation",
    messageId: message.id, createdAt: message.createdAt } as const;
  assert.deepEqual(replaced, [{ ...saved, tripId: "trip-id", status: "active" }]);
  assert.deepEqual(result, {
    canProceed: true,
    handoff: {
      ...context, tripState, preferenceStatus: "ready",
      // The old extraction is replaced; the plan-page preference stays.
      preferences: [
        saved,
        { id: "added-id", label: "喜欢拍照", kind: "interests", quote: "喜欢拍照", source: "plan_page", messageId: null, createdAt: "2026-11-10T11:00:00.000Z" },
      ],
    },
  });
});

test("keeps the saved preferences when extraction is unavailable", async () => {
  const response = await handlePlanningHandoffPost("trip-id", "owner-id", context, {
    loadJourney: async () => ({ tripState }),
    listMessages: async () => [message],
    extractPreferences: async () => ({ preferenceStatus: "unavailable", preferences: [] }),
    listPreferences: async () => [removedBefore, addedOnPlanPage],
    replaceConversationPreferences: unreachable,
    newId: () => assert.fail("No new preference"),
  });
  const body = await response.json() as { handoff: { preferences: { id: string }[]; preferenceStatus: string } };
  assert.equal(body.handoff.preferenceStatus, "unavailable");
  assert.deepEqual(body.handoff.preferences.map(({ id }) => id), ["added-id"]);
});

test("blocks an unverified destination before loading history or running the model", async () => {
  const response = await handlePlanningHandoffPost("trip-id", "owner-id", context, {
    async loadJourney() {
      return { tripState: { ...tripState, destination: { state: "known", source: "user", areas: [], legacyText: "大理" } } };
    },
    listMessages: unreachable,
    extractPreferences: unreachable,
    listPreferences: unreachable,
    replaceConversationPreferences: unreachable,
    newId: () => assert.fail("No new preference"),
  });
  assert.deepEqual(await response.json(), { canProceed: false, reason: "destination_unverified" });
});

test("missing and unauthorized journeys both return 404 before loading messages", async () => {
  const dependencies = {
    async loadJourney() { throw new TripNotFoundError("trip-id"); },
    listMessages: unreachable,
    extractPreferences: unreachable,
    listPreferences: unreachable,
    replaceConversationPreferences: unreachable,
    newId: () => assert.fail("No new preference"),
  };
  for (const owner of [null, "wrong-owner"]) {
    const response = await handlePlanningHandoffPost("trip-id", owner, context, dependencies);
    assert.equal(response.status, 404);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
  }
});
