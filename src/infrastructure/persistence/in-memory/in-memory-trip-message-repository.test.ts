import assert from "node:assert/strict";
import test from "node:test";

import type { TripMessage } from "@/domain/trip-message/trip-message";

import { InMemoryTripMessageRepository } from "./in-memory-trip-message-repository";

const tripId = "3d17d2c7-fd9b-4748-b751-3a76a9a920be";

function message(
  id: string,
  role: TripMessage["role"],
  content: string,
  createdAt: string,
  owningTripId: string = tripId,
): TripMessage {
  return { id, tripId: owningTripId, role, content, createdAt };
}

test("persists complete turns in chronological order", async () => {
  const repository = new InMemoryTripMessageRepository();
  const laterUser = message(
    "00000000-0000-4000-8000-000000000003",
    "user",
    "再看看交通",
    "2026-09-21T08:01:00.000Z",
  );
  const laterAssistant = message(
    "00000000-0000-4000-8000-000000000004",
    "assistant",
    "好的。",
    "2026-09-21T08:01:00.001Z",
  );
  const earlierUser = message(
    "00000000-0000-4000-8000-000000000001",
    "user",
    "先看看雪况",
    "2026-09-21T08:00:00.000Z",
  );
  const earlierAssistant = message(
    "00000000-0000-4000-8000-000000000002",
    "assistant",
    "可以。",
    "2026-09-21T08:00:00.001Z",
  );

  await repository.createTurn(laterUser, laterAssistant);
  await repository.createTurn(earlierUser, earlierAssistant);

  assert.deepEqual(await repository.listByTripId(tripId), [
    earlierUser,
    earlierAssistant,
    laterUser,
    laterAssistant,
  ]);
});

test("does not return messages from another Trip", async () => {
  const repository = new InMemoryTripMessageRepository();
  const user = message(
    "00000000-0000-4000-8000-000000000001",
    "user",
    "我的消息",
    "2026-09-21T08:00:00.000Z",
  );
  const assistant = message(
    "00000000-0000-4000-8000-000000000002",
    "assistant",
    "我的回复",
    "2026-09-21T08:00:00.001Z",
  );
  await repository.createTurn(user, assistant);
  await repository.createTurn(
    message(
      "00000000-0000-4000-8000-000000000003",
      "user",
      "其他 Trip",
      "2026-09-21T08:00:01.000Z",
      "f9eb62d2-95e6-4693-80d1-c808d70c17dc",
    ),
    message(
      "00000000-0000-4000-8000-000000000004",
      "assistant",
      "其他回复",
      "2026-09-21T08:00:01.001Z",
      "f9eb62d2-95e6-4693-80d1-c808d70c17dc",
    ),
  );

  assert.deepEqual(await repository.listByTripId(tripId), [user, assistant]);
});
