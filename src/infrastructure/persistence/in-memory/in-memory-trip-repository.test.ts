import assert from "node:assert/strict";
import test from "node:test";

import type { Trip } from "@/domain/trip/trip";

import { InMemoryTripRepository } from "./in-memory-trip-repository";

const guestA = "25ba5b26-8db0-4fe3-bfcc-b684dd7889cc";
const guestB = "f6dd6c50-91c6-4ad1-9089-dbb3feaa61cc";

const trip: Trip = {
  id: "trip_123",
  name: "贡嘎徒步",
  origin: "成都",
  destination: "贡嘎",
  startDate: null,
  endDate: null,
  status: "idea",
  createdAt: "2026-09-20T08:00:00.000Z",
  updatedAt: "2026-09-20T08:00:00.000Z",
};

test("creates and finds a Trip", async () => {
  const repository = new InMemoryTripRepository();

  const created = await repository.create(trip, guestA);

  assert.strictEqual(created, trip);
  assert.strictEqual(await repository.findById(trip.id, guestA), trip);
});

test("does not return another guest's Trip", async () => {
  const repository = new InMemoryTripRepository();
  await repository.create(trip, guestA);

  assert.equal(await repository.findById(trip.id, guestB), null);
});

test("updates a Trip by replacing its previous value", async () => {
  const repository = new InMemoryTripRepository();
  await repository.create(trip, guestA);
  const updatedTrip: Trip = {
    ...trip,
    destination: "四姑娘山",
    updatedAt: "2026-09-20T09:00:00.000Z",
  };

  await repository.update(updatedTrip, guestA);

  assert.strictEqual(await repository.findById(trip.id, guestA), updatedTrip);
});

test("returns null when a Trip is missing", async () => {
  const repository = new InMemoryTripRepository();

  assert.equal(await repository.findById("missing", guestA), null);
});


test("lists only the owner's Trips in recent-first order", async () => {
  const repository = new InMemoryTripRepository();
  const olderTrip: Trip = {
    ...trip,
    id: "trip_older",
    updatedAt: "2026-09-20T08:00:00.000Z",
  };
  const newerTrip: Trip = {
    ...trip,
    id: "trip_newer",
    destination: null,
    startDate: null,
    endDate: null,
    updatedAt: "2026-09-21T08:00:00.000Z",
  };
  const otherGuestTrip: Trip = {
    ...trip,
    id: "trip_other_guest",
    updatedAt: "2026-09-22T08:00:00.000Z",
  };

  await repository.create(olderTrip, guestA);
  await repository.create(otherGuestTrip, guestB);
  await repository.create(newerTrip, guestA);

  const result = await repository.listByOwner(guestA);

  assert.deepEqual(result, [newerTrip, olderTrip]);
  assert.deepEqual(await repository.listByOwner(guestB), [otherGuestTrip]);
  assert.equal(result[0].destination, null);
  assert.equal(result[0].startDate, null);
});
