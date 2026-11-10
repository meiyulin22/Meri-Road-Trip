import assert from "node:assert/strict";
import test from "node:test";

import { handlePlanningHandoffPost } from "./planning-handoff-handler";
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
const preference = { messageId: message.id, quote: "少走台阶", createdAt: message.createdAt };
const unreachable = async (): Promise<never> => assert.fail("Dependency should not be called");

test("POST hands the plan page saved trip facts and extracted preferences without the message history", async () => {
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
        return { preferenceStatus: "ready", preferences: [preference] };
      },
    });
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    return response;
  });
  assert.deepEqual(result, {
    canProceed: true,
    handoff: { ...context, tripState, preferenceStatus: "ready", preferences: [preference] },
  });
});

test("blocks an unverified destination before loading history or running the model", async () => {
  const response = await handlePlanningHandoffPost("trip-id", "owner-id", context, {
    async loadJourney() {
      return { tripState: { ...tripState, destination: { state: "known", source: "user", areas: [], legacyText: "大理" } } };
    },
    listMessages: unreachable,
    extractPreferences: unreachable,
  });
  assert.deepEqual(await response.json(), { canProceed: false, reason: "destination_unverified" });
});

test("missing and unauthorized journeys both return 404 before loading messages", async () => {
  const dependencies = {
    async loadJourney() { throw new TripNotFoundError("trip-id"); },
    listMessages: unreachable,
    extractPreferences: unreachable,
  };
  for (const owner of [null, "wrong-owner"]) {
    const response = await handlePlanningHandoffPost("trip-id", owner, context, dependencies);
    assert.equal(response.status, 404);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
  }
});
