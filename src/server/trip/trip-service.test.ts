import assert from "node:assert/strict";
import test from "node:test";

import { InvalidTripInputError, TripNotFoundError } from "@/domain/trip/trip-errors";
import { InMemoryTripRepository } from "@/infrastructure/persistence/in-memory/in-memory-trip-repository";
import { TripService } from "./trip-service";

const guestA = "25ba5b26-8db0-4fe3-bfcc-b684dd7889cc";
const guestB = "f6dd6c50-91c6-4ad1-9089-dbb3feaa61cc";

function createTestService(repository = new InMemoryTripRepository()) {
  return new TripService({
    repository,
    generateId: () => "trip_123",
    now: () => new Date("2026-09-13T08:00:00.000Z"),
  });
}

test("creates only the Trip identity and lifecycle fields", async () => {
  const trip = await createTestService().createTrip({ status: "planning" }, guestA);
  assert.deepEqual(trip, {
    id: "trip_123",
    status: "planning",
    createdAt: "2026-09-13T08:00:00.000Z",
    updatedAt: "2026-09-13T08:00:00.000Z",
  });
});

test("defaults a new Trip to idea status", async () => {
  const trip = await createTestService().createTrip({}, guestA);
  assert.equal(trip.status, "idea");
});

test("rejects obsolete evolving fields and unsupported status", async () => {
  const service = createTestService();
  await assert.rejects(service.createTrip({ destination: "大连" }, guestA), InvalidTripInputError);
  await assert.rejects(service.createTrip({ status: "ready" }, guestA), InvalidTripInputError);
  await assert.rejects(service.createTrip(null, guestA), InvalidTripInputError);
});

test("retrieves an owned Trip by ID", async () => {
  const service = createTestService();
  const created = await service.createTrip({}, guestA);
  assert.deepEqual(await service.getTripById(created.id, guestA), created);
  await assert.rejects(service.getTripById(created.id, guestB), TripNotFoundError);
  await assert.rejects(service.getTripById("missing", guestA), TripNotFoundError);
});

test("uses the server owner argument instead of an input owner field", async () => {
  const repository = new InMemoryTripRepository();
  const service = createTestService(repository);

  await assert.rejects(
    service.createTrip({ ownerGuestId: guestB }, guestA),
    InvalidTripInputError,
  );
  await service.createTrip({}, guestA);

  assert.ok(await repository.findById("trip_123", guestA));
  assert.equal(await repository.findById("trip_123", guestB), null);
});
