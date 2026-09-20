import assert from "node:assert/strict";
import test from "node:test";

import type { TripDraft } from "@/domain/trip-draft/trip-draft";

import {
  clearTemporaryTripWorkspace,
  getTemporaryTripWorkspace,
  setTemporaryTripWorkspace,
} from "./temporary-trip-workspace-store";
import {
  requestWorkspaceConversation,
  WorkspaceConversationRequestError,
} from "./workspace-conversation-model";

const draft: TripDraft = {
  name: { state: "known", value: "二世谷滑雪" },
  origin: { state: "missing" },
  destination: { state: "known", value: "二世谷" },
  startDate: { state: "missing" },
  endDate: { state: "missing" },
  duration: { state: "missing" },
  transportPreference: { state: "missing" },
};

test("accepts a validated workspace conversation response", async () => {
  clearTemporaryTripWorkspace();
  await setTemporaryTripWorkspace(draft, "想去二世谷滑雪");
  const tripState = getTemporaryTripWorkspace()?.tripState;
  assert.ok(tripState);

  const interpretation = await requestWorkspaceConversation(
    "改成富良野",
    tripState,
    async () =>
      new Response(
        JSON.stringify({
          interpretation: {
            intent: "trip_state_update",
            changes: [
              { field: "destination", state: "known", value: "富良野" },
            ],
            reply: "好的，目的地改成富良野。",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
  );

  assert.equal(interpretation.intent, "trip_state_update");
});

test("failed AI request leaves the temporary TripState unchanged", async () => {
  clearTemporaryTripWorkspace();
  await setTemporaryTripWorkspace(draft, "想去二世谷滑雪");
  const beforeFailure = getTemporaryTripWorkspace()?.tripState;
  assert.ok(beforeFailure);

  await assert.rejects(
    requestWorkspaceConversation(
      "改成富良野",
      beforeFailure,
      async () => {
        throw new Error("network unavailable");
      },
    ),
    WorkspaceConversationRequestError,
  );

  assert.strictEqual(
    getTemporaryTripWorkspace()?.tripState,
    beforeFailure,
  );
});
