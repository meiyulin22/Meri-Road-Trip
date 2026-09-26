import assert from "node:assert/strict";
import test from "node:test";

import { appendPersistedMessageIfAbsent, recommendationPresentation, toWorkspaceUIMessages } from "./trip-message-ui-adapter";

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

test("restored recommendation presentation remains attached to its assistant message", () => {
  const presentation = { type: "destination_recommendations" as const, destinations: [
    { id: "a", name: "甲", region: null, reason: "一", imageUrl: null },
    { id: "b", name: "乙", region: null, reason: "二", imageUrl: null },
    { id: "c", name: "丙", region: null, reason: "三", imageUrl: null },
  ] };
  const restored = toWorkspaceUIMessages([{
    id: "recommendation", tripId: "trip-1", role: "assistant", content: "看看这些地方。",
    presentation, createdAt: "2026-09-26T00:00:00.000Z",
  }]);
  assert.deepEqual(recommendationPresentation(restored[0]), presentation);
  assert.equal(restored[0].parts[0].type, "text");
});

test("appends persisted guidance once without turning it into a user message", () => {
  const guidance = {
    id: "guidance-1", tripId: "trip-1", role: "assistant" as const,
    content: "还没想好去哪吗？我可以根据你的旅行偏好推荐几个地方。",
    createdAt: "2026-09-23T00:00:02.000Z",
  };
  const initial = toWorkspaceUIMessages([]);
  const withGuidance = appendPersistedMessageIfAbsent(initial, guidance);
  assert.deepEqual(withGuidance, [{
    id: guidance.id, role: "assistant", parts: [{ type: "text", text: guidance.content }],
  }]);
  assert.strictEqual(appendPersistedMessageIfAbsent(withGuidance, guidance), withGuidance);
});
