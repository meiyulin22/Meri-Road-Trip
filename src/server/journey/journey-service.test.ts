import assert from "node:assert/strict";
import test from "node:test";

import type { TripDraft } from "@/domain/trip-draft/trip-draft";
import type { TripState } from "@/domain/trip-state/trip-state";
import type { Trip } from "@/domain/trip/trip";
import { TripNotFoundError } from "@/domain/trip/trip-errors";
import type { TripStateRepository } from "@/repositories/trip-state-repository";

import { JourneyCreationError, TripStateNotFoundError } from "./journey-errors";
import { JourneyService } from "./journey-service";

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
  name: "富良野滑雪",
  origin: null,
  destination: "富良野",
  startDate: null,
  endDate: null,
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
  let repositoryTripId = "";
  const service = new JourneyService({
    tripService: {
      async createTrip(input) {
        receivedTripInput = input;
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
    async deleteTripById() {},
  });

  const journey = await service.createJourney(draft);

  assert.equal(repositoryTripId, trip.id);
  assert.deepEqual(receivedTripInput, {
    name: "富良野滑雪",
    origin: null,
    destination: "富良野",
    startDate: null,
    endDate: null,
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
    async deleteTripById(tripId) {
      deletedTripIds.push(tripId);
    },
  });

  await assert.rejects(service.createJourney(draft), JourneyCreationError);
  assert.deepEqual(deletedTripIds, [trip.id]);
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
    async deleteTripById() {},
  });

  const journey = await service.loadJourney(trip.id);

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
    async deleteTripById() {},
  });

  await assert.rejects(service.loadJourney(trip.id), TripStateNotFoundError);
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
    async deleteTripById() {},
  });

  await assert.rejects(service.loadJourney("missing"), TripNotFoundError);
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
    async deleteTripById() {},
  });

  const updated = await service.updateTripState(trip.id, {
    destination: { state: "known", value: "富良野", source: "user" },
  });

  assert.deepEqual(updated.destination, {
    state: "known",
    value: "富良野",
    source: "user",
  });
  assert.deepEqual(repositoryTripIds, [trip.id, trip.id]);
  assert.strictEqual(stateRepository.getState(), updated);
});
