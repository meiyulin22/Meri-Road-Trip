import assert from "node:assert/strict";
import test from "node:test";

import {
  InvalidTripInputError,
  TripNotFoundError,
} from "@/domain/trip/trip-errors";
import { InMemoryTripRepository } from "./in-memory-trip-repository";
import { TripService } from "./trip-service";

const validInput = {
  name: "四姑娘山周末",
  destination: "四姑娘山",
  startDate: "2026-09-19",
  endDate: "2026-09-21",
};

function createTestService() {
  return new TripService({
    repository: new InMemoryTripRepository(),
    generateId: () => "trip_123",
    now: () => new Date("2026-09-13T08:00:00.000Z"),
  });
}

test("creates a valid Trip", async () => {
  const service = createTestService();
  const trip = await service.createTrip({
    ...validInput,
    status: "planning",
  });

  assert.deepEqual(trip, {
    id: "trip_123",
    ...validInput,
    status: "planning",
    createdAt: "2026-09-13T08:00:00.000Z",
    updatedAt: "2026-09-13T08:00:00.000Z",
  });
});

test("defaults a new Trip to idea status", async () => {
  const service = createTestService();
  const trip = await service.createTrip(validInput);

  assert.equal(trip.status, "idea");
});

test("rejects an empty Trip name", async () => {
  const service = createTestService();

  await assert.rejects(
    service.createTrip({ ...validInput, name: "  " }),
    InvalidTripInputError,
  );
});

test("rejects an empty destination", async () => {
  const service = createTestService();

  await assert.rejects(
    service.createTrip({ ...validInput, destination: "" }),
    InvalidTripInputError,
  );
});

test("rejects invalid date values and formats", async () => {
  const service = createTestService();

  await assert.rejects(
    service.createTrip({ ...validInput, startDate: "2026-02-30" }),
    InvalidTripInputError,
  );

  await assert.rejects(
    service.createTrip({ ...validInput, startDate: "2026/09/19" }),
    InvalidTripInputError,
  );
});

test("rejects an end date before the start date", async () => {
  const service = createTestService();

  await assert.rejects(
    service.createTrip({ ...validInput, endDate: "2026-09-18" }),
    InvalidTripInputError,
  );
});

test("rejects an unsupported Trip status", async () => {
  const service = createTestService();

  await assert.rejects(
    service.createTrip({ ...validInput, status: "ready" }),
    InvalidTripInputError,
  );
});

test("retrieves a stored Trip by ID", async () => {
  const service = createTestService();
  const createdTrip = await service.createTrip(validInput);

  const loadedTrip = await service.getTripById(createdTrip.id);

  assert.deepEqual(loadedTrip, createdTrip);
});

test("reports when a Trip is not found", async () => {
  const service = createTestService();

  await assert.rejects(service.getTripById("missing"), TripNotFoundError);
});
