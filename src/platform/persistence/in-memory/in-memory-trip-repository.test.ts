import assert from "node:assert/strict";
import test from "node:test";

import type { Trip } from "@/domain/trip/trip";
import { InMemoryTripRepository } from "./in-memory-trip-repository";

const guestA = "25ba5b26-8db0-4fe3-bfcc-b684dd7889cc";
const guestB = "f6dd6c50-91c6-4ad1-9089-dbb3feaa61cc";

const trip: Trip = {
  id: "trip_123",
  status: "idea",
  createdAt: "2026-09-20T08:00:00.000Z",
  updatedAt: "2026-09-20T08:00:00.000Z",
};

test("creates and finds a Trip for its owner", async () => {
  const repository = new InMemoryTripRepository();
  assert.strictEqual(await repository.create(trip, guestA), trip);
  assert.strictEqual(await repository.findById(trip.id, guestA), trip);
  assert.equal(await repository.findById(trip.id, guestB), null);
  assert.equal(await repository.findById("missing", guestA), null);
});
