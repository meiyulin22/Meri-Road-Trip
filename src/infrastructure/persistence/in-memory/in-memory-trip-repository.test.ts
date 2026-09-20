import assert from "node:assert/strict";
import test from "node:test";

import type { Trip } from "@/domain/trip/trip";

import { InMemoryTripRepository } from "./in-memory-trip-repository";

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

  const created = await repository.create(trip);

  assert.strictEqual(created, trip);
  assert.strictEqual(await repository.findById(trip.id), trip);
});

test("updates a Trip by replacing its previous value", async () => {
  const repository = new InMemoryTripRepository();
  await repository.create(trip);
  const updatedTrip: Trip = {
    ...trip,
    destination: "四姑娘山",
    updatedAt: "2026-09-20T09:00:00.000Z",
  };

  await repository.update(updatedTrip);

  assert.strictEqual(await repository.findById(trip.id), updatedTrip);
});

test("returns null when a Trip is missing", async () => {
  const repository = new InMemoryTripRepository();

  assert.equal(await repository.findById("missing"), null);
});
