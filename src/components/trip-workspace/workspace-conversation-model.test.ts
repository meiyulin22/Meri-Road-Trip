import assert from "node:assert/strict";
import test from "node:test";

import type { TripState } from "@/domain/trip-state/trip-state";

import {
  requestWorkspaceConversation,
  WorkspaceConversationRequestError,
  WorkspaceLimitError,
} from "./workspace-conversation-model";

const tripState: TripState = {
  name: { state: "known", value: "二世谷滑雪", source: "system" },
  origin: { state: "missing" },
  destination: { state: "known" as const, source: "user", areas: [], legacyText: "富良野" },
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
          destinationEdit:{operation:"set",places:["富良野"],broadRegion:null},presentationIntent:"none",changes:[],
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
  assert.equal(result.interpretation.destinationEdit.operation, "set");
  assert.deepEqual(result.tripState, tripState);
  assert.deepEqual(
    result.messages.map((message) => message.role),
    ["user", "assistant"],
  );
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

test("a reached site limit is its own error, so the chat explains it instead of asking to refresh (step 2)", async () => {
  for (const code of ["daily_quota", "paid_calls_paused"] as const) {
    const refused = requestWorkspaceConversation("推荐一下", "trip-1", async () => Response.json({ error: "limited", code }, { status: 503 }));
    await assert.rejects(refused, (error: unknown) => error instanceof WorkspaceLimitError && error.limit === code);
  }
  // Any other failure stays the general one.
  const failed = requestWorkspaceConversation("推荐一下", "trip-1", async () => Response.json({ error: "failed" }, { status: 502 }));
  await assert.rejects(failed, (error: unknown) => error instanceof WorkspaceConversationRequestError && !(error instanceof WorkspaceLimitError));
});
