import assert from "node:assert/strict";
import test from "node:test";

import type { TripState } from "@/domain/trip-state/trip-state";

import {
  requestWorkspaceConversation,
  selectLocationCandidate,
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
        messages: [
          {
            id: "00000000-0000-4000-8000-000000000001",
            tripId: "trip_123",
            role: "user",
            content: "改成富良野",
            createdAt: "2026-09-22T08:00:00.000Z",
          },
          {
            id: "00000000-0000-4000-8000-000000000002",
            tripId: "trip_123",
            role: "assistant",
            content: "好的，目的地改成富良野。",
            createdAt: "2026-09-22T08:00:00.001Z",
          },
        ],
      });
    },
  );

  assert.deepEqual(JSON.parse(requestBody), {
    message: "改成富良野",
    tripId: "trip_123",
  });
  assert.equal(result.interpretation.intent, "trip_state_update");
  assert.deepEqual(result.tripState, tripState);
  assert.deepEqual(
    result.messages.map((message) => message.role),
    ["user", "assistant"],
  );
});

test("candidate selection posts only persisted message identity and index", async () => {
  const selected = await selectLocationCandidate("trip 1", "assistant-1", 1, async (input, init) => {
    assert.equal(input, "/api/trips/trip%201/location-candidate-selection");
    assert.equal(init?.method, "POST");
    assert.deepEqual(JSON.parse(init?.body as string), { messageId: "assistant-1", candidateIndex: 1 });
    return Response.json({ tripState });
  });
  assert.deepEqual(selected, tripState);
  await assert.rejects(selectLocationCandidate("trip", "assistant-1", 99,
    async () => Response.json({ error: "Candidate selection not found." }, { status: 404 })),
  WorkspaceConversationRequestError);
});

test("default conversation fetch uses the browser global receiver", async (t) => {
  let receiverIsGlobal = false;
  t.mock.method(globalThis, "fetch", async function (this: unknown): Promise<Response> {
    receiverIsGlobal = this === globalThis;
    return Response.json({ error: "expected test response" }, { status: 502 });
  });

  await assert.rejects(
    requestWorkspaceConversation("改成富良野", "trip_123"),
    WorkspaceConversationRequestError,
  );
  assert.equal(receiverIsGlobal, true);
});

test("failed AI request does not produce replacement state", async () => {
  await assert.rejects(
    requestWorkspaceConversation("改成富良野", "trip_123", async () => {
      throw new Error("network unavailable");
    }),
    WorkspaceConversationRequestError,
  );
});
