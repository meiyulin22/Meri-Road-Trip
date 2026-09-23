import assert from "node:assert/strict";
import test from "node:test";

import { toWorkspaceUIMessages } from "./trip-message-ui-adapter";

test("maps persisted TripMessages to ordered UI messages without changing IDs, roles, or text", () => {
  const messages = [
    { id: "user-1", tripId: "trip-1", role: "user" as const, content: "去阿尔山", createdAt: "2026-09-23T00:00:00.000Z" },
    { id: "assistant-1", tripId: "trip-1", role: "assistant" as const, content: "好，我们慢慢计划。", createdAt: "2026-09-23T00:00:01.000Z" },
  ];

  assert.deepEqual(toWorkspaceUIMessages(messages), [
    { id: "user-1", role: "user", parts: [{ type: "text", text: "去阿尔山" }] },
    { id: "assistant-1", role: "assistant", parts: [{ type: "text", text: "好，我们慢慢计划。" }] },
  ]);
  assert.equal(messages[0].id, "user-1");
});
