import assert from "node:assert/strict";
import test from "node:test";

import type { TripMessage } from "@/domain/trip-message/trip-message";
import type { TripMessageRepository } from "@/platform/persistence/trip-message-repository";
import { TripNotFoundError } from "@/domain/trip/trip-errors";

import { TripMessageService } from "./trip-message-service";
import { destinationMissingGuidanceMessageId } from "./destination-missing-guidance";
import { locationCandidateSelectionMessageId } from "./destination-selection-message-id";

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

test("persists ambiguous candidates with the assistant side of the real conversation turn", async () => {
  const messageRepository = createRepository();
  const service = new TripMessageService({ tripService: createTripService(guestA), repository: messageRepository.repository });
  const assistantPresentation = { type: "location_candidates" as const, candidates: [
    { providerId: "poi-1", name: "吉林市", province: "吉林省", city: "吉林市", district: null,
      region: "吉林省", address: null, longitude: 126.55, latitude: 43.84, coordinateSystem: "GCJ-02" as const },
    { providerId: "poi-2", name: "吉林", province: null, city: null, district: null,
      region: "中国东北", address: null, longitude: 125.32, latitude: 43.89, coordinateSystem: "GCJ-02" as const },
  ] };
  const [user, assistant] = await service.persistSuccessfulTurn({ tripId, ownerGuestId: guestA,
    userContent: "去吉林", assistantContent: "请选择具体地点", assistantPresentation });
  assert.equal(user.presentation, undefined);
  assert.deepEqual(assistant.presentation, assistantPresentation);
  assert.deepEqual(await service.listMessages(tripId, guestA), [user, assistant]);
});

test("opening candidates persist on the assistant message and survive a fresh read", async () => {
  const messageRepository = createRepository();
  const service = new TripMessageService({
    tripService: createTripService(guestA), repository: messageRepository.repository,
    generateId: () => "00000000-0000-4000-8000-000000000003",
    now: () => new Date("2026-09-22T08:00:00.000Z"),
  });
  const presentation = { type: "location_candidates" as const, candidates: [
    { providerId: "poi-a", name: "青岛市", province: "山东省", city: "青岛市", district: null,
      region: "山东省", address: null, longitude: 120.38, latitude: 36.07, coordinateSystem: "GCJ-02" as const },
    { providerId: "poi-b", name: "青岛", province: "山东省", city: "青岛市", district: null,
      region: "山东省", address: null, longitude: 120.39, latitude: 36.08, coordinateSystem: "GCJ-02" as const },
  ] };
  const user = await service.persistInitialUserMessage({ tripId, ownerGuestId: guestA, content: "去青岛" });
  const assistant = await service.persistOpeningAssistant({ tripId, ownerGuestId: guestA,
    content: "请选择地点", presentation });
  assert.equal(user.presentation, undefined);
  assert.deepEqual(assistant.presentation, presentation);
  assert.ok(user.createdAt < assistant.createdAt);
  const reloaded = new TripMessageService({ tripService: createTripService(guestA),
    repository: messageRepository.repository });
  assert.deepEqual(await reloaded.listMessages(tripId, guestA), [user, assistant]);
  assert.deepEqual(await reloaded.persistOpeningAssistant({ tripId, ownerGuestId: guestA,
    content: "other" }), assistant);
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

test("candidate selection persists one assistant message with a stable ID and no user message", async () => {
  const messageRepository = createRepository();
  const service = new TripMessageService({ tripService: createTripService(guestA),
    repository: messageRepository.repository,
    now: () => new Date("2026-09-26T00:00:02.000Z") });
  const input = { tripId, ownerGuestId: guestA,
    messageId: locationCandidateSelectionMessageId(tripId, "assistant-candidates", 1),
    content: "好，目的地定好了。" };
  const first = await service.persistDestinationSelectionReply(input);
  const retry = await service.persistDestinationSelectionReply({ ...input, content: "different reply" });
  assert.strictEqual(retry, first);
  assert.equal(first.id, locationCandidateSelectionMessageId(tripId, "assistant-candidates", 1));
  assert.notEqual(first.id, destinationMissingGuidanceMessageId(tripId));
  assert.equal(first.role, "assistant");
  assert.equal(messageRepository.getCreateTurnCalls(), 0);
  assert.deepEqual(messageRepository.getMessages(), [first]);
  assert.notEqual(first.id, locationCandidateSelectionMessageId(tripId, "assistant-candidates", 0));
  await assert.rejects(service.persistDestinationSelectionReply({ ...input, ownerGuestId: guestB }), TripNotFoundError);
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
