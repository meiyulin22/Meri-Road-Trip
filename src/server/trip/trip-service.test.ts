import assert from "node:assert/strict";
import test from "node:test";

import {
  InvalidTripInputError,
  TripNotFoundError,
} from "@/domain/trip/trip-errors";
import { InMemoryTripRepository } from "./in-memory-trip-repository";
import { TripService } from "./trip-service";

const guestA = "25ba5b26-8db0-4fe3-bfcc-b684dd7889cc";
const guestB = "f6dd6c50-91c6-4ad1-9089-dbb3feaa61cc";

const validInput = {
  name: "四姑娘山周末",
  origin: "成都",
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
  const trip = await service.createTrip(
    {
      ...validInput,
      status: "planning",
    },
    guestA,
  );

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
  const trip = await service.createTrip(validInput, guestA);

  assert.equal(trip.status, "idea");
});

test("creates an incomplete Trip idea", async () => {
  const service = createTestService();
  const trip = await service.createTrip(
    {
      name: "今年冬天想找个地方滑雪",
      origin: null,
      destination: null,
      startDate: null,
      endDate: null,
    },
    guestA,
  );

  assert.deepEqual(trip, {
    id: "trip_123",
    name: "今年冬天想找个地方滑雪",
    origin: null,
    destination: null,
    startDate: null,
    endDate: null,
    status: "idea",
    createdAt: "2026-09-13T08:00:00.000Z",
    updatedAt: "2026-09-13T08:00:00.000Z",
  });
});

test("accepts a complete valid date range", async () => {
  const service = createTestService();
  const trip = await service.createTrip(
    {
      ...validInput,
      startDate: "2026-09-19",
      endDate: "2026-09-19",
    },
    guestA,
  );

  assert.equal(trip.startDate, "2026-09-19");
  assert.equal(trip.endDate, "2026-09-19");
});

test("allows one date to remain undecided", async () => {
  const service = createTestService();
  const trip = await service.createTrip(
    {
      ...validInput,
      endDate: null,
    },
    guestA,
  );

  assert.equal(trip.startDate, "2026-09-19");
  assert.equal(trip.endDate, null);
});

test("rejects an empty Trip name", async () => {
  const service = createTestService();

  await assert.rejects(
    service.createTrip({ ...validInput, name: "  " }, guestA),
    InvalidTripInputError,
  );
});

test("rejects an empty origin", async () => {
  const service = createTestService();

  await assert.rejects(
    service.createTrip({ ...validInput, origin: "  " }, guestA),
    InvalidTripInputError,
  );
});

test("rejects an empty destination", async () => {
  const service = createTestService();

  await assert.rejects(
    service.createTrip({ ...validInput, destination: "" }, guestA),
    InvalidTripInputError,
  );
});

test("rejects invalid date values and formats", async () => {
  const service = createTestService();

  await assert.rejects(
    service.createTrip({ ...validInput, startDate: "2026-02-30" }, guestA),
    InvalidTripInputError,
  );

  await assert.rejects(
    service.createTrip({ ...validInput, startDate: "2026/09/19" }, guestA),
    InvalidTripInputError,
  );
});

test("rejects an end date before the start date", async () => {
  const service = createTestService();

  await assert.rejects(
    service.createTrip({ ...validInput, endDate: "2026-09-18" }, guestA),
    InvalidTripInputError,
  );
});

test("rejects an unsupported Trip status", async () => {
  const service = createTestService();

  await assert.rejects(
    service.createTrip({ ...validInput, status: "ready" }, guestA),
    InvalidTripInputError,
  );
});

test("lists only Trips belonging to the requested guest", async () => {
  const repository = new InMemoryTripRepository();
  const service = new TripService({
    repository,
    generateId: () => "trip_123",
    now: () => new Date("2026-09-13T08:00:00.000Z"),
  });
  const ownedTrip = await service.createTrip(validInput, guestA);
  await repository.create(
    { ...ownedTrip, id: "trip_other", name: "另一个人的旅程" },
    guestB,
  );

  const result = await service.listTrips(guestA);

  assert.deepEqual(result, [ownedTrip]);
});

test("retrieves a stored Trip by ID", async () => {
  const service = createTestService();
  const createdTrip = await service.createTrip(validInput, guestA);

  const loadedTrip = await service.getTripById(createdTrip.id, guestA);

  assert.deepEqual(loadedTrip, createdTrip);
});

test("reports when a Trip is not found", async () => {
  const service = createTestService();

  await assert.rejects(
    service.getTripById("missing", guestA),
    TripNotFoundError,
  );
});

test("does not load a Trip owned by another guest", async () => {
  const service = createTestService();
  const createdTrip = await service.createTrip(validInput, guestA);

  await assert.rejects(
    service.getTripById(createdTrip.id, guestB),
    TripNotFoundError,
  );
});

test("uses the server owner argument instead of an input owner field", async () => {
  const repository = new InMemoryTripRepository();
  const service = new TripService({
    repository,
    generateId: () => "trip_123",
    now: () => new Date("2026-09-13T08:00:00.000Z"),
  });

  await service.createTrip({ ...validInput, ownerGuestId: guestB }, guestA);

  assert.ok(await repository.findById("trip_123", guestA));
  assert.equal(await repository.findById("trip_123", guestB), null);
});
