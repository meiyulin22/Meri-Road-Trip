import assert from "node:assert/strict";
import test from "node:test";

import type { TripDraft } from "@/domain/trip-draft/trip-draft";
import type { TripState } from "@/domain/trip-state/trip-state";
import type { Trip } from "@/domain/trip/trip";
import { TripNotFoundError } from "@/domain/trip/trip-errors";
import type { TripStateRepository } from "@/repositories/trip-state-repository";

import { JourneyCreationError, TripStateNotFoundError } from "./journey-errors";
import { JourneyService } from "./journey-service";

const guestA = "25ba5b26-8db0-4fe3-bfcc-b684dd7889cc";
const guestB = "f6dd6c50-91c6-4ad1-9089-dbb3feaa61cc";

const draft: TripDraft = {
  name: { state: "known", value: "富良野滑雪" },
  origin: { state: "missing" },
  destination: { state: "known", value: "富良野" },
  startDate: { state: "approximate", value: "今年冬天" },
  endDate: { state: "missing" },
  duration: { state: "missing" },
  transportPreference: { state: "missing" },
};

const trip: Trip = {
  id: "trip_123",
  status: "idea",
  createdAt: "2026-09-20T08:00:00.000Z",
  updatedAt: "2026-09-20T08:00:00.000Z",
};

function createStateRepository(
  initialState: TripState | null = null,
  createError?: Error,
) {
  let state = initialState;
  const repository: TripStateRepository = {
    async create(nextState) {
      if (createError) {
        throw createError;
      }
      state = nextState;
      return nextState;
    },
    async findByTripId() {
      return state;
    },
    async update(nextState) {
      state = nextState;
    },
  };

  return { repository, getState: () => state };
}

test("creates an incomplete Trip and authoritative TripState with one identity", async () => {
  const stateRepository = createStateRepository();
  let receivedTripInput: unknown;
  let receivedOwnerGuestId = "";
  let repositoryTripId = "";
  const service = new JourneyService({
    tripService: {
      async createTrip(input, ownerGuestId) {
        receivedTripInput = input;
        receivedOwnerGuestId = ownerGuestId;
        return trip;
      },
      async getTripById() {
        return trip;
      },
    },
    createTripStateRepository(tripId) {
      repositoryTripId = tripId;
      return stateRepository.repository;
    },
    async deleteTripById() { return true; },
  });

  const journey = await service.createJourney(draft, guestA);

  assert.equal(repositoryTripId, trip.id);
  assert.equal(receivedOwnerGuestId, guestA);
  assert.deepEqual(receivedTripInput, {});
  assert.deepEqual(journey.tripState.destination, {
    state: "known",
    value: "富良野",
    source: "user",
  });
  assert.deepEqual(journey.tripState.startDate, {
    state: "approximate",
    value: "今年冬天",
    source: "user",
  });
  assert.strictEqual(stateRepository.getState(), journey.tripState);
});

test("rolls back Trip when initial TripState creation fails", async () => {
  const stateRepository = createStateRepository(
    null,
    new Error("state insert failed"),
  );
  const deletedTripIds: string[] = [];
  const service = new JourneyService({
    tripService: {
      async createTrip() {
        return trip;
      },
      async getTripById() {
        return trip;
      },
    },
    createTripStateRepository: () => stateRepository.repository,
    async deleteTripById(tripId, ownerGuestId) {
      assert.equal(ownerGuestId, guestA);
      deletedTripIds.push(tripId);
      return true;
    },
  });

  await assert.rejects(
    service.createJourney(draft, guestA),
    JourneyCreationError,
  );
  assert.deepEqual(deletedTripIds, [trip.id]);
});

test("persists the exact Home message after TripState creation", async () => {
  const events: string[] = [];
  const initialUserMessage = "  我想去富良野滑雪。\n十月左右。  ";
  const service = new JourneyService({
    tripService: {
      async createTrip() { events.push("trip"); return trip; },
      async getTripById() { return trip; },
    },
    createTripStateRepository: () => ({
      ...createStateRepository().repository,
      async create(state) { events.push("state"); return state; },
    }),
    async persistInitialUserMessage(input) {
      events.push("message");
      assert.deepEqual(input, { tripId: trip.id, ownerGuestId: guestA, content: initialUserMessage });
    },
    async deleteTripById() { throw new Error("cleanup must not run"); },
  });

  await service.createJourney(draft, guestA, initialUserMessage);
  assert.deepEqual(events, ["trip", "state", "message"]);
});

test("initial message failure cleans up the newly created Trip", async () => {
  const deleted: string[] = [];
  const messageError = new Error("message insert failed");
  const service = new JourneyService({
    tripService: {
      async createTrip() { return trip; },
      async getTripById() { return trip; },
    },
    createTripStateRepository: () => createStateRepository().repository,
    async persistInitialUserMessage() { throw messageError; },
    async deleteTripById(tripId, ownerGuestId) {
      assert.equal(ownerGuestId, guestA);
      deleted.push(tripId);
      return true;
    },
  });

  await assert.rejects(service.createJourney(draft, guestA, "原始想法"), (error) => {
    assert.ok(error instanceof JourneyCreationError);
    assert.equal(error.cause, messageError);
    return true;
  });
  assert.deepEqual(deleted, [trip.id]);
});

test("initial message and cleanup failures preserve both causes", async () => {
  const messageError = new Error("message insert failed");
  const cleanupError = new Error("trip delete failed");
  const service = new JourneyService({
    tripService: {
      async createTrip() { return trip; },
      async getTripById() { return trip; },
    },
    createTripStateRepository: () => createStateRepository().repository,
    async persistInitialUserMessage() { throw messageError; },
    async deleteTripById() { throw cleanupError; },
  });

  await assert.rejects(service.createJourney(draft, guestA, "原始想法"), (error) => {
    assert.ok(error instanceof JourneyCreationError);
    assert.ok(error.cause instanceof AggregateError);
    assert.deepEqual(error.cause.errors, [messageError, cleanupError]);
    return true;
  });
});

test("rejects a blank initial message before creating a Trip", async () => {
  let createCount = 0;
  const service = new JourneyService({
    tripService: {
      async createTrip() { createCount += 1; return trip; },
      async getTripById() { return trip; },
    },
    createTripStateRepository: () => createStateRepository().repository,
    async persistInitialUserMessage() { throw new Error("must not persist"); },
    async deleteTripById() { return true; },
  });

  await assert.rejects(service.createJourney(draft, guestA, "  \n  "));
  assert.equal(createCount, 0);
});

test("deletes only an owned Journey and treats other-owner and missing IDs alike", async () => {
  const calls: Array<[string, string]> = [];
  const service = new JourneyService({
    tripService: {
      async createTrip() { return trip; },
      async getTripById() { return trip; },
    },
    createTripStateRepository: () => createStateRepository().repository,
    async deleteTripById(tripId, ownerGuestId) {
      calls.push([tripId, ownerGuestId]);
      return tripId === trip.id && ownerGuestId === guestA;
    },
  });

  assert.equal(await service.deleteJourney(trip.id, guestB), false);
  assert.equal(await service.deleteJourney("missing", guestA), false);
  assert.equal(await service.deleteJourney(trip.id, guestA), true);
  assert.deepEqual(calls, [
    [trip.id, guestB],
    ["missing", guestA],
    [trip.id, guestA],
  ]);
});

test("loads an existing Trip and TripState", async () => {
  const stateRepository = createStateRepository({
    name: { state: "known", value: "富良野滑雪", source: "system" },
    origin: { state: "missing" },
    destination: { state: "known", value: "富良野", source: "user" },
    startDate: { state: "approximate", value: "今年冬天", source: "user" },
    endDate: { state: "missing" },
    duration: { state: "missing" },
    transportPreference: { state: "missing" },
  });
  const service = new JourneyService({
    tripService: {
      async createTrip() {
        return trip;
      },
      async getTripById() {
        return trip;
      },
    },
    createTripStateRepository: () => stateRepository.repository,
    async deleteTripById() { return true; },
  });

  const journey = await service.loadJourney(trip.id, guestA);

  assert.equal(journey.trip.id, trip.id);
  assert.strictEqual(journey.tripState, stateRepository.getState());
});

test("does not invent replacement state when TripState is missing", async () => {
  const stateRepository = createStateRepository();
  const service = new JourneyService({
    tripService: {
      async createTrip() {
        return trip;
      },
      async getTripById() {
        return trip;
      },
    },
    createTripStateRepository: () => stateRepository.repository,
    async deleteTripById() { return true; },
  });

  await assert.rejects(
    service.loadJourney(trip.id, guestA),
    TripStateNotFoundError,
  );
});

test("propagates a missing Trip without loading TripState", async () => {
  let stateRepositoryCreated = false;
  const service = new JourneyService({
    tripService: {
      async createTrip() {
        return trip;
      },
      async getTripById(tripId) {
        throw new TripNotFoundError(tripId);
      },
    },
    createTripStateRepository() {
      stateRepositoryCreated = true;
      return createStateRepository().repository;
    },
    async deleteTripById() { return true; },
  });

  await assert.rejects(
    service.loadJourney("missing", guestA),
    TripNotFoundError,
  );
  assert.equal(stateRepositoryCreated, false);
});

test("updates state through the repository bound to the real Trip ID", async () => {
  const initialState: TripState = {
    name: { state: "known", value: "富良野滑雪", source: "system" },
    origin: { state: "missing" },
    destination: { state: "known", value: "二世谷", source: "user" },
    startDate: { state: "missing" },
    endDate: { state: "missing" },
    duration: { state: "missing" },
    transportPreference: { state: "missing" },
  };
  const stateRepository = createStateRepository(initialState);
  const repositoryTripIds: string[] = [];
  const service = new JourneyService({
    tripService: {
      async createTrip() {
        return trip;
      },
      async getTripById() {
        return trip;
      },
    },
    createTripStateRepository(tripId) {
      repositoryTripIds.push(tripId);
      return stateRepository.repository;
    },
    async deleteTripById() { return true; },
  });

  const updated = await service.updateTripState(
    trip.id,
    guestA,
    {
      destination: { state: "known", value: "富良野", source: "user" },
    },
  );

  assert.deepEqual(updated.destination, {
    state: "known",
    value: "富良野",
    source: "user",
  });
  assert.deepEqual(updated.name, {
    state: "known",
    value: "富良野之旅",
    source: "system",
  });
  assert.deepEqual(repositoryTripIds, [trip.id, trip.id]);
  assert.strictEqual(stateRepository.getState(), updated);
});

test("does not load another guest's Journey", async () => {
  const stateRepository = createStateRepository();
  const service = new JourneyService({
    tripService: {
      async createTrip() {
        return trip;
      },
      async getTripById(tripId, ownerGuestId) {
        if (ownerGuestId !== guestA) {
          throw new TripNotFoundError(tripId);
        }
        return trip;
      },
    },
    createTripStateRepository: () => stateRepository.repository,
    async deleteTripById() { return true; },
  });

  await assert.rejects(
    service.loadJourney(trip.id, guestB),
    TripNotFoundError,
  );
});

test("does not update another guest's TripState", async () => {
  const stateRepository = createStateRepository();
  let updateWasCalled = false;
  const repository: TripStateRepository = {
    ...stateRepository.repository,
    async update() {
      updateWasCalled = true;
    },
  };
  const service = new JourneyService({
    tripService: {
      async createTrip() {
        return trip;
      },
      async getTripById(tripId, ownerGuestId) {
        if (ownerGuestId !== guestA) {
          throw new TripNotFoundError(tripId);
        }
        return trip;
      },
    },
    createTripStateRepository: () => repository,
    async deleteTripById() { return true; },
  });

  await assert.rejects(
    service.updateTripState(trip.id, guestB, {
      destination: { state: "known", value: "札幌", source: "user" },
    }),
    TripNotFoundError,
  );
  assert.equal(updateWasCalled, false);
});
