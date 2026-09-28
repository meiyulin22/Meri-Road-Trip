import assert from "node:assert/strict";
import test from "node:test";

import type { TripState } from "@/domain/trip-state/trip-state";

import { InMemoryTripStateRepository } from "./in-memory-trip-state-repository";

const state: TripState = {
  name: { state: "known", value: "冬季滑雪", source: "system" },
  origin: { state: "missing" },
  destination: { state: "known", value: "二世谷", source: "user" },
  startDate: { state: "approximate", value: "今年冬天", source: "user" },
  endDate: { state: "missing" },
  duration: { state: "missing" },
  transportPreference: { state: "missing" },
};

test("creates and finds TripState by its owning Trip ID", async () => {
  const repository = new InMemoryTripStateRepository("trip_123");

  const created = await repository.create(state);

  assert.strictEqual(created, state);
  assert.strictEqual(await repository.findByTripId("trip_123"), state);
});

test("updates TripState by replacing its previous value", async () => {
  const repository = new InMemoryTripStateRepository("trip_123");
  await repository.create(state);
  const updatedState: TripState = {
    ...state,
    destination: { state: "known", value: "富良野", source: "user" },
  };

  await repository.update(updatedState);

  assert.strictEqual(
    await repository.findByTripId("trip_123"),
    updatedState,
  );
});

test("returns null when TripState is missing", async () => {
  const repository = new InMemoryTripStateRepository("trip_123");

  assert.equal(await repository.findByTripId("missing"), null);
});
