import assert from "node:assert/strict";
import test from "node:test";

import type { TripMessage } from "@/domain/trip-message/trip-message";

import { selectRecentConversationMessages } from "./workspace-conversation-context";

function message(role: TripMessage["role"], content: string): TripMessage {
  return {
    id: `${role}-${content}`,
    tripId: "trip-123",
    role,
    content,
    createdAt: "2026-09-23T00:00:00.000Z",
  };
}

test("empty history leaves the current request single-turn", () => {
  assert.deepEqual(selectRecentConversationMessages([]), []);
});

test("keeps complete turns in chronological order with original roles", () => {
  const history = [
    message("user", "Could we go to Furano?"),
    message("assistant", "Would you like to change the destination to Furano?"),
  ];

  assert.deepEqual(selectRecentConversationMessages(history), [
    { role: "user", content: "Could we go to Furano?" },
    {
      role: "assistant",
      content: "Would you like to change the destination to Furano?",
    },
  ]);
});

test("selects at most the five newest complete turns", () => {
  const history = Array.from({ length: 7 }, (_, index) => [
    message("user", `user ${index}`),
    message("assistant", `assistant ${index}`),
  ]).flat();

  const selected = selectRecentConversationMessages(history);
  assert.equal(selected.length, 10);
  assert.deepEqual(selected[0], { role: "user", content: "user 2" });
  assert.deepEqual(selected.at(-1), {
    role: "assistant",
    content: "assistant 6",
  });
});

test("stops before older turns when the character budget is exhausted", () => {
  const history = [
    message("user", "old user"),
    message("assistant", "old assistant"),
    message("user", "x".repeat(3_000)),
    message("assistant", "y".repeat(3_000)),
  ];

  const selected = selectRecentConversationMessages(history);
  assert.equal(selected.length, 2);
  assert.equal(selected[0].content.length + selected[1].content.length, 6_000);
});

test("drops an oversized newest turn rather than sending unbounded history", () => {
  const history = [
    message("user", "old user"),
    message("assistant", "old assistant"),
    message("user", "x".repeat(6_001)),
    message("assistant", "new assistant"),
  ];

  assert.deepEqual(selectRecentConversationMessages(history), []);
});

test("does not begin with an orphan assistant or include an incomplete turn", () => {
  const history = [
    message("assistant", "orphan"),
    message("user", "real user"),
    message("assistant", "real assistant"),
    message("user", "incomplete user"),
  ];

  assert.deepEqual(selectRecentConversationMessages(history), [
    { role: "user", content: "real user" },
    { role: "assistant", content: "real assistant" },
  ]);
});
