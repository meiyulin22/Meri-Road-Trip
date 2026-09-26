import assert from "node:assert/strict";
import test from "node:test";

import type { TripMessage } from "@/domain/trip-message/trip-message";
import type { TripMessageRepository } from "@/repositories/trip-message-repository";
import { TripNotFoundError } from "@/domain/trip/trip-errors";

import { TripMessageService } from "./trip-message-service";
import { destinationMissingGuidanceContent, destinationMissingGuidanceMessageId } from "./destination-missing-guidance";
import { openingAssistantMessageId } from "./opening-assistant-id";

const tripId = "3d17d2c7-fd9b-4748-b751-3a76a9a920be";
const guestA = "25ba5b26-8db0-4fe3-bfcc-b684dd7889cc";
const guestB = "f6dd6c50-91c6-4ad1-9089-dbb3feaa61cc";

function createRepository(initialMessages: TripMessage[] = []) {
  const messages = [...initialMessages];
  let createTurnCalls = 0;

  const repository: TripMessageRepository = {
    async createAssistantIfAbsent(message) {
      const existing = messages.find((item) => item.id === message.id);
      if (existing) return existing;
      messages.push(message);
      return message;
    },
    async createMessage(message) {
      messages.push(message);
    },
    async createTurn(userMessage, assistantMessage) {
      createTurnCalls += 1;
      messages.push(userMessage, assistantMessage);
    },
    async listByTripId(requestedTripId) {
      return messages.filter((message) => message.tripId === requestedTripId);
    },
  };

  return {
    repository,
    getCreateTurnCalls: () => createTurnCalls,
    getMessages: () => messages,
  };
}

function createTripService(ownerGuestId: string) {
  return {
    async getTripById(requestedTripId: string, requestedOwnerGuestId: string) {
      if (requestedTripId !== tripId || requestedOwnerGuestId !== ownerGuestId) {
        throw new TripNotFoundError(requestedTripId);
      }

      return {
        id: tripId,
        name: "富良野滑雪",
        origin: null,
        destination: "富良野",
        startDate: null,
        endDate: null,
        status: "idea" as const,
        createdAt: "2026-09-22T08:00:00.000Z",
        updatedAt: "2026-09-22T08:00:00.000Z",
      };
    },
  };
}

test("persists a completed user and assistant turn", async () => {
  const messageRepository = createRepository();
  const ids = [
    "00000000-0000-4000-8000-000000000001",
    "00000000-0000-4000-8000-000000000002",
  ];
  const service = new TripMessageService({
    tripService: createTripService(guestA),
    repository: messageRepository.repository,
    generateId: () => ids.shift() as string,
    now: () => new Date("2026-09-22T08:00:00.000Z"),
  });

  const result = await service.persistSuccessfulTurn({
    tripId,
    ownerGuestId: guestA,
    userContent: "改成富良野",
    assistantContent: "好的，目的地改成富良野。",
  });

  assert.equal(messageRepository.getCreateTurnCalls(), 1);
  assert.deepEqual(result, messageRepository.getMessages());
  assert.deepEqual(
    result.map((message) => [message.role, message.createdAt]),
    [
      ["user", "2026-09-22T08:00:00.000Z"],
      ["assistant", "2026-09-22T08:00:00.001Z"],
    ],
  );
});

test("persists one original user message with its exact content", async () => {
  const messageRepository = createRepository();
  const service = new TripMessageService({
    tripService: createTripService(guestA),
    repository: messageRepository.repository,
    generateId: () => "00000000-0000-4000-8000-000000000003",
    now: () => new Date("2026-09-22T08:00:00.000Z"),
  });

  const message = await service.persistInitialUserMessage({
    tripId,
    ownerGuestId: guestA,
    content: "  我想去日本滑雪。\n  ",
  });
  assert.equal(message.role, "user");
  assert.equal(message.content, "  我想去日本滑雪。\n  ");
  assert.deepEqual(await service.listMessages(tripId, guestA), [message]);
  assert.deepEqual(await service.listMessages(tripId, guestA), [message]);
  assert.equal(messageRepository.getMessages().length, 1);
  assert.equal(messageRepository.getCreateTurnCalls(), 0);
});

test("destination guidance is a single persisted assistant message with a dedicated stable ID", async () => {
  const messageRepository = createRepository();
  const service = new TripMessageService({
    tripService: createTripService(guestA),
    repository: messageRepository.repository,
    now: () => new Date("2026-09-22T08:00:00.000Z"),
  });
  const first = await service.persistDestinationMissingGuidance({ tripId, ownerGuestId: guestA });
  const repeated = await service.persistDestinationMissingGuidance({ tripId, ownerGuestId: guestA });
  assert.strictEqual(repeated, first);
  assert.equal(first.id, destinationMissingGuidanceMessageId(tripId));
  assert.notEqual(first.id, openingAssistantMessageId(tripId));
  assert.equal(first.role, "assistant");
  assert.equal(first.content, destinationMissingGuidanceContent);
  assert.deepEqual(messageRepository.getMessages(), [first]);
  await assert.rejects(service.persistDestinationMissingGuidance({ tripId, ownerGuestId: guestB }), TripNotFoundError);
});

test("restores persisted conversation history", async () => {
  const persistedMessages: TripMessage[] = [
    {
      id: "00000000-0000-4000-8000-000000000001",
      tripId,
      role: "user",
      content: "改成富良野",
      createdAt: "2026-09-22T08:00:00.000Z",
    },
    {
      id: "00000000-0000-4000-8000-000000000002",
      tripId,
      role: "assistant",
      content: "好的，目的地改成富良野。",
      createdAt: "2026-09-22T08:00:00.001Z",
    },
  ];
  const service = new TripMessageService({
    tripService: createTripService(guestA),
    repository: createRepository(persistedMessages).repository,
  });

  assert.deepEqual(await service.listMessages(tripId, guestA), persistedMessages);
});

test("does not expose another guest's messages", async () => {
  const repository = createRepository();
  const service = new TripMessageService({
    tripService: createTripService(guestA),
    repository: repository.repository,
  });

  await assert.rejects(
    service.listMessages(tripId, guestB),
    TripNotFoundError,
  );
  assert.equal(repository.getCreateTurnCalls(), 0);
});

test("does not leave half a turn when persistence fails", async () => {
  const storedMessages: TripMessage[] = [];
  const repository: TripMessageRepository = {
    async createAssistantIfAbsent() {
      throw new Error("insert failed");
    },
    async createMessage() {
      throw new Error("insert failed");
    },
    async createTurn() {
      throw new Error("insert failed");
    },
    async listByTripId() {
      return storedMessages;
    },
  };
  const service = new TripMessageService({
    tripService: createTripService(guestA),
    repository,
    generateId: () => "00000000-0000-4000-8000-000000000001",
    now: () => new Date("2026-09-22T08:00:00.000Z"),
  });

  await assert.rejects(
    service.persistSuccessfulTurn({
      tripId,
      ownerGuestId: guestA,
      userContent: "改成富良野",
      assistantContent: "好的。",
    }),
  );
  assert.deepEqual(storedMessages, []);
});
