import assert from "node:assert/strict";
import test from "node:test";

import type { TripState } from "@/domain/trip-state/trip-state";

import {
  requestWorkspaceConversation,
  WorkspaceConversationRequestError,
} from "./workspace-conversation-model";

const tripState: TripState = {
  name: { state: "known", value: "二世谷滑雪", source: "system" },
  origin: { state: "missing" },
  destination: { state: "known", value: "富良野", source: "user" },
  startDate: { state: "missing" },
  endDate: { state: "missing" },
  duration: { state: "missing" },
  transportPreference: { state: "missing" },
};

test("accepts a persisted workspace conversation response", async () => {
  let requestBody = "";
  const result = await requestWorkspaceConversation(
    "改成富良野",
    "trip_123",
    async (_input, init) => {
      requestBody = init?.body as string;
      return Response.json({
        interpretation: {
          intent: "trip_state_update",
          changes: [
            { field: "destination", state: "known", value: "富良野" },
          ],
          reply: "好的，目的地改成富良野。",
        },
        tripState,
      });
    },
  );

  assert.deepEqual(JSON.parse(requestBody), {
    message: "改成富良野",
    tripId: "trip_123",
  });
  assert.equal(result.interpretation.intent, "trip_state_update");
  assert.deepEqual(result.tripState, tripState);
});

test("failed AI request does not produce replacement state", async () => {
  await assert.rejects(
    requestWorkspaceConversation("改成富良野", "trip_123", async () => {
      throw new Error("network unavailable");
    }),
    WorkspaceConversationRequestError,
  );
});
