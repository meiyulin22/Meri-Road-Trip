import assert from "node:assert/strict";
import test from "node:test";

import type { Trip } from "@/domain/trip/trip";
import { trips } from "@/server/database/schema/trips";
import {
  PostgresTripRepository,
  PostgresTripRepositoryError,
} from "./postgres-trip-repository";

const guestA = "25ba5b26-8db0-4fe3-bfcc-b684dd7889cc";
const guestB = "f6dd6c50-91c6-4ad1-9089-dbb3feaa61cc";

type TripDatabase = ConstructorParameters<typeof PostgresTripRepository>[0];
type TripRow = typeof trips.$inferSelect;
type TripInsert = typeof trips.$inferInsert;

const trip: Trip = {
  id: "3d17d2c7-fd9b-4748-b751-3a76a9a920be",
  name: "四姑娘山周末",
  origin: "成都",
  destination: "四姑娘山",
  startDate: "2026-09-19",
  endDate: "2026-09-21",
  status: "planning",
  createdAt: "2026-09-16T01:02:03.000Z",
  updatedAt: "2026-09-16T04:05:06.000Z",
};

type DatabaseDoubleOptions = {
  rows?: TripRow[];
  saveError?: Error;
  findError?: Error;
  listError?: Error;
};

function createDatabaseDouble({
  rows = [],
  saveError,
  findError,
  listError,
}: DatabaseDoubleOptions = {}) {
  let insertedTable: unknown;
  let insertedTrip: TripInsert | undefined;
  let selectedTable: unknown;
  let whereWasCalled = false;
  let selectedLimit: number | undefined;
  let orderByArgumentCount: number | undefined;
  let deletedTable: unknown;
  let deleteWhereWasCalled = false;

  const database = {
    insert(table: unknown) {
      insertedTable = table;

      return {
        async values(value: TripInsert) {
          insertedTrip = value;

          if (saveError) {
            throw saveError;
          }
        },
      };
    },
    select() {
      return {
        from(table: unknown) {
          selectedTable = table;

          return {
            where() {
              whereWasCalled = true;

              return {
                async limit(value: number) {
                  selectedLimit = value;

                  if (findError) {
                    throw findError;
                  }

                  return rows;
                },
                async orderBy(...values: unknown[]) {
                  orderByArgumentCount = values.length;

                  if (listError) {
                    throw listError;
                  }

                  return rows;
                },
              };
            },
          };
        },
      };
    },
    delete(table: unknown) {
      deletedTable = table;
      return {
        async where() {
          deleteWhereWasCalled = true;
        },
      };
    },
  } as unknown as TripDatabase;

  return {
    database,
    inspection: {
      get insertedTable() {
        return insertedTable;
      },
      get insertedTrip() {
        return insertedTrip;
      },
      get selectedTable() {
        return selectedTable;
      },
      get selectedLimit() {
        return selectedLimit;
      },
      get whereWasCalled() {
        return whereWasCalled;
      },
      get orderByArgumentCount() {
        return orderByArgumentCount;
      },
      get deletedTable() {
        return deletedTable;
      },
      get deleteWhereWasCalled() {
        return deleteWhereWasCalled;
      },
    },
  };
}

test("saves an explicitly mapped Trip row", async () => {
  const { database, inspection } = createDatabaseDouble();
  const repository = new PostgresTripRepository(database);

  await repository.save(trip, guestA);

  assert.equal(inspection.insertedTable, trips);
  assert.equal(inspection.insertedTrip?.origin, "成都");
  assert.deepEqual(inspection.insertedTrip, {
    ...trip,
    ownerGuestId: guestA,
  });
});

test("finds and maps a Trip row to the domain representation", async () => {
  const row: TripRow = {
    ...trip,
    ownerGuestId: guestA,
    createdAt: "2026-09-16 01:02:03+00",
    updatedAt: "2026-09-16 04:05:06+00",
  };
  const { database, inspection } = createDatabaseDouble({ rows: [row] });
  const repository = new PostgresTripRepository(database);

  const result = await repository.findById(trip.id, guestA);

  assert.equal(inspection.selectedTable, trips);
  assert.equal(inspection.whereWasCalled, true);
  assert.equal(inspection.selectedLimit, 1);
  assert.deepEqual(result, trip);
});

test("maps an incomplete Trip row without filling missing information", async () => {
  const row: TripRow = {
    ...trip,
    ownerGuestId: guestA,
    origin: null,
    destination: null,
    startDate: null,
    endDate: null,
  };
  const { database } = createDatabaseDouble({ rows: [row] });
  const repository = new PostgresTripRepository(database);

  const result = await repository.findById(trip.id, guestA);

  assert.equal(result?.origin, null);
  assert.equal(result?.destination, null);
  assert.equal(result?.startDate, null);
  assert.equal(result?.endDate, null);
});

test("lists owned Trips using deterministic database ordering", async () => {
  const newerTrip: TripRow = {
    ...trip,
    id: "3d17d2c7-fd9b-4748-b751-3a76a9a920bf",
    ownerGuestId: guestA,
    destination: null,
    startDate: null,
    endDate: null,
    updatedAt: "2026-09-21 04:05:06+00",
  };
  const olderTrip: TripRow = {
    ...trip,
    ownerGuestId: guestA,
    createdAt: "2026-09-16 01:02:03+00",
    updatedAt: "2026-09-16 04:05:06+00",
  };
  const { database, inspection } = createDatabaseDouble({
    rows: [newerTrip, olderTrip],
  });
  const repository = new PostgresTripRepository(database);

  const result = await repository.listByOwner(guestA);

  assert.equal(inspection.selectedTable, trips);
  assert.equal(inspection.whereWasCalled, true);
  assert.equal(inspection.orderByArgumentCount, 3);
  assert.deepEqual(
    result.map((listedTrip) => listedTrip.id),
    [newerTrip.id, olderTrip.id],
  );
  assert.equal(result[0].destination, null);
});

test("returns null when no Trip row exists", async () => {
  const { database } = createDatabaseDouble();
  const repository = new PostgresTripRepository(database);

  const result = await repository.findById("missing-trip", guestA);

  assert.equal(result, null);
});

test("deletes a Trip for failed Journey creation compensation", async () => {
  const { database, inspection } = createDatabaseDouble();
  const repository = new PostgresTripRepository(database);

  await repository.deleteById(trip.id, guestA);

  assert.equal(inspection.deletedTable, trips);
  assert.equal(inspection.deleteWhereWasCalled, true);
});

test("preserves the cause when saving fails", async () => {
  const databaseError = new Error("database insert failed");
  const { database } = createDatabaseDouble({ saveError: databaseError });
  const repository = new PostgresTripRepository(database);

  await assert.rejects(repository.save(trip, guestA), (error: unknown) => {
    assert.ok(error instanceof PostgresTripRepositoryError);
    assert.equal(error.operation, "save");
    assert.equal(error.tripId, trip.id);
    assert.equal(error.cause, databaseError);
    assert.match(error.stack ?? "", /PostgresTripRepositoryError/);
    return true;
  });
});

test("preserves the cause when listing Trips fails", async () => {
  const databaseError = new Error("database list failed");
  const { database } = createDatabaseDouble({ listError: databaseError });
  const repository = new PostgresTripRepository(database);

  await assert.rejects(repository.listByOwner(guestA), (error: unknown) => {
    assert.ok(error instanceof PostgresTripRepositoryError);
    assert.equal(error.operation, "listByOwner");
    assert.equal(error.tripId, null);
    assert.equal(error.cause, databaseError);
    return true;
  });
});

test("preserves the cause when finding a Trip fails", async () => {
  const databaseError = new Error("database select failed");
  const { database } = createDatabaseDouble({ findError: databaseError });
  const repository = new PostgresTripRepository(database);

  await assert.rejects(repository.findById(trip.id, guestB), (error: unknown) => {
    assert.ok(error instanceof PostgresTripRepositoryError);
    assert.equal(error.operation, "findById");
    assert.equal(error.tripId, trip.id);
    assert.equal(error.cause, databaseError);
    assert.match(error.stack ?? "", /PostgresTripRepositoryError/);
    return true;
  });
});
