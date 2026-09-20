import assert from "node:assert/strict";
import test from "node:test";

import type { TripState } from "@/domain/trip-state/trip-state";
import { tripStates } from "@/server/database/schema/trip-states";

import { PostgresTripStateRepository } from "./postgres-trip-state-repository";

type TripStateDatabase = ConstructorParameters<
  typeof PostgresTripStateRepository
>[0];
type TripStateRow = typeof tripStates.$inferSelect;
type TripStateInsert = typeof tripStates.$inferInsert;

const state: TripState = {
  name: { state: "known", value: "冬季滑雪", source: "system" },
  origin: { state: "missing" },
  destination: {
    state: "ambiguous",
    value: "二世谷或者富良野",
    source: "user",
  },
  startDate: { state: "approximate", value: "今年冬天", source: "user" },
  endDate: { state: "missing" },
  duration: { state: "known", value: "一周", source: "user" },
  transportPreference: { state: "missing" },
};

function createDatabaseDouble(rows: TripStateRow[] = []) {
  let inserted: TripStateInsert | undefined;
  let updated: Partial<TripStateInsert> | undefined;
  let updateWhereCalled = false;

  const database = {
    insert() {
      return {
        async values(value: TripStateInsert) {
          inserted = value;
        },
      };
    },
    select() {
      return {
        from() {
          return {
            where() {
              return { async limit() { return rows; } };
            },
          };
        },
      };
    },
    update() {
      return {
        set(value: Partial<TripStateInsert>) {
          updated = value;
          return {
            async where() {
              updateWhereCalled = true;
            },
          };
        },
      };
    },
  } as unknown as TripStateDatabase;

  return {
    database,
    inspection: {
      get inserted() { return inserted; },
      get updated() { return updated; },
      get updateWhereCalled() { return updateWhereCalled; },
    },
  };
}

test("creates TripState with exact certainty, source, and text", async () => {
  const { database, inspection } = createDatabaseDouble();
  const repository = new PostgresTripStateRepository(
    database,
    "trip_123",
    () => new Date("2026-09-20T08:00:00.000Z"),
  );

  assert.strictEqual(await repository.create(state), state);
  assert.equal(inspection.inserted?.tripId, "trip_123");
  assert.strictEqual(inspection.inserted?.state, state);
});

test("loads TripState without losing domain semantics", async () => {
  const row: TripStateRow = {
    tripId: "trip_123",
    state,
    createdAt: "2026-09-20 08:00:00+00",
    updatedAt: "2026-09-20 08:00:00+00",
  };
  const { database } = createDatabaseDouble([row]);
  const repository = new PostgresTripStateRepository(database, "trip_123");

  const loaded = await repository.findByTripId("trip_123");

  assert.deepEqual(loaded, state);
  assert.equal(loaded?.startDate.state, "approximate");
  assert.equal(loaded?.destination.state, "ambiguous");
  assert.deepEqual(loaded?.origin, { state: "missing" });
  assert.equal(
    loaded?.destination.state === "ambiguous"
      ? loaded.destination.source
      : null,
    "user",
  );
  assert.equal(
    loaded?.startDate.state === "approximate" ? loaded.startDate.value : null,
    "今年冬天",
  );
});

test("updates the row belonging to its Trip ID", async () => {
  const { database, inspection } = createDatabaseDouble();
  const repository = new PostgresTripStateRepository(database, "trip_123");
  const updatedState: TripState = {
    ...state,
    destination: { state: "known", value: "富良野", source: "user" },
  };

  await repository.update(updatedState);

  assert.strictEqual(inspection.updated?.state, updatedState);
  assert.equal(inspection.updateWhereCalled, true);
});

test("returns null when TripState does not exist", async () => {
  const { database } = createDatabaseDouble();
  const repository = new PostgresTripStateRepository(database, "trip_123");

  assert.equal(await repository.findByTripId("missing"), null);
});
