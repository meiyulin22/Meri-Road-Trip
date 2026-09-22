import assert from "node:assert/strict";
import test from "node:test";

import type { TripMessage } from "@/domain/trip-message/trip-message";

import {
  addOptimisticUserMessage,
  createInitialConversationMessages,
  markTemporaryMessageFailed,
  reconcilePersistedTurn,
  revealNextAssistantChunk,
} from "./conversation-display-model";

const tripId = "3d17d2c7-fd9b-4748-b751-3a76a9a920be";
const persistedUser: TripMessage = {
  id: "00000000-0000-4000-8000-000000000001",
  tripId,
  role: "user",
  content: "改成富良野",
  createdAt: "2026-09-22T08:00:00.000Z",
};
const persistedAssistant: TripMessage = {
  id: "00000000-0000-4000-8000-000000000002",
  tripId,
  role: "assistant",
  content: "好的，目的地改成富良野。",
  createdAt: "2026-09-22T08:00:00.001Z",
};

test("adds an optimistic user message before persistence completes", () => {
  const result = addOptimisticUserMessage([], {
    id: "temporary:1",
    content: persistedUser.content,
  });

  assert.deepEqual(result[0], {
    id: "temporary:1",
    identity: "temporary",
    role: "user",
    content: persistedUser.content,
    visibleContent: persistedUser.content,
    delivery: "sending",
  });
});

test("reconciles the temporary user without rendering a duplicate", () => {
  const optimistic = addOptimisticUserMessage([], {
    id: "temporary:1",
    content: persistedUser.content,
  });

  const result = reconcilePersistedTurn(
    optimistic,
    "temporary:1",
    [persistedUser, persistedAssistant],
  );

  assert.equal(result.filter((message) => message.role === "user").length, 1);
  assert.equal(result[0].id, persistedUser.id);
  assert.equal(result[0].identity, "persisted");
});

test("starts assistant reveal only after the persisted response exists", () => {
  const optimistic = addOptimisticUserMessage([], {
    id: "temporary:1",
    content: persistedUser.content,
  });

  assert.equal(
    optimistic.some((message) => message.role === "assistant"),
    false,
  );

  const reconciled = reconcilePersistedTurn(
    optimistic,
    "temporary:1",
    [persistedUser, persistedAssistant],
  );
  const assistantBeforeReveal = reconciled.find(
    (message) => message.role === "assistant",
  );

  assert.equal(assistantBeforeReveal?.visibleContent, "");
  assert.equal(assistantBeforeReveal?.delivery, "revealing");

  const revealed = revealNextAssistantChunk(
    reconciled,
    persistedAssistant.id,
    3,
  );
  assert.equal(
    revealed.find((message) => message.role === "assistant")?.visibleContent,
    "好的，",
  );
});

test("keeps a failed optimistic message visible", () => {
  const optimistic = addOptimisticUserMessage([], {
    id: "temporary:1",
    content: persistedUser.content,
  });

  const result = markTemporaryMessageFailed(optimistic, "temporary:1");

  assert.equal(result[0].visibleContent, persistedUser.content);
  assert.equal(result[0].delivery, "failed");
  assert.equal(result[0].identity, "temporary");
});

test("does not replay reveal for initial persisted history", () => {
  const result = createInitialConversationMessages([
    persistedUser,
    persistedAssistant,
  ]);

  assert.deepEqual(
    result.map((message) => [message.visibleContent, message.delivery]),
    [
      [persistedUser.content, "persisted"],
      [persistedAssistant.content, "persisted"],
    ],
  );
});
