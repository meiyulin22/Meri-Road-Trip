import assert from "node:assert/strict";
import test from "node:test";

import type { TripMessage } from "@/domain/trip-message/trip-message";
import { tripMessages } from "@/platform/persistence/database/schema/trip-messages";

import {
  PostgresTripMessageRepository,
  PostgresTripMessageRepositoryError,
} from "./postgres-trip-message-repository";

type TripMessageDatabase = ConstructorParameters<
  typeof PostgresTripMessageRepository
>[0];
type TripMessageRow = typeof tripMessages.$inferSelect;

const tripId = "3d17d2c7-fd9b-4748-b751-3a76a9a920be";
const userMessage: TripMessage = {
  id: "00000000-0000-4000-8000-000000000001",
  tripId,
  role: "user",
  content: "改成富良野",
  createdAt: "2026-09-22T08:00:00.000Z",
};
const assistantMessage: TripMessage = {
  id: "00000000-0000-4000-8000-000000000002",
  tripId,
  role: "assistant",
  content: "好的，目的地改成富良野。",
  createdAt: "2026-09-22T08:00:00.001Z",
};

type DatabaseDoubleOptions = {
  rows?: TripMessageRow[];
  createError?: Error;
  listError?: Error;
};

function createDatabaseDouble({
  rows = [],
  createError,
  listError,
}: DatabaseDoubleOptions = {}) {
  let insertedTable: unknown;
  let insertedRows: unknown;
  let selectedTable: unknown;
  let whereWasCalled = false;
  let orderByArgumentCount: number | undefined;

  const database = {
    insert(table: unknown) {
      insertedTable = table;
      return {
        async values(values: unknown) {
          insertedRows = values;
          if (createError) {
            throw createError;
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
  } as unknown as TripMessageDatabase;

  return {
    database,
    inspection: {
      get insertedTable() {
        return insertedTable;
      },
      get insertedRows() {
        return insertedRows;
      },
      get selectedTable() {
        return selectedTable;
      },
      get whereWasCalled() {
        return whereWasCalled;
      },
      get orderByArgumentCount() {
        return orderByArgumentCount;
      },
    },
  };
}

test("persists both sides of a completed turn in one insert", async () => {
  const { database, inspection } = createDatabaseDouble();
  const repository = new PostgresTripMessageRepository(database);

  await repository.createTurn(userMessage, assistantMessage);

  assert.equal(inspection.insertedTable, tripMessages);
  assert.deepEqual(inspection.insertedRows, [
    { ...userMessage, presentation: null }, { ...assistantMessage, presentation: null },
  ]);
});

test("persists an initial user message in the existing messages table", async () => {
  const { database, inspection } = createDatabaseDouble();
  const repository = new PostgresTripMessageRepository(database);

  await repository.createMessage(userMessage);

  assert.equal(inspection.insertedTable, tripMessages);
  assert.deepEqual(inspection.insertedRows, { ...userMessage, presentation: null });
});

test("restores messages in chronological database order", async () => {
  const rows: TripMessageRow[] = [
    { ...userMessage, presentation: null, createdAt: "2026-09-22 08:00:00+00" },
    { ...assistantMessage, presentation: null, createdAt: "2026-09-22 08:00:00.001+00" },
  ];
  const { database, inspection } = createDatabaseDouble({ rows });
  const repository = new PostgresTripMessageRepository(database);

  const result = await repository.listByTripId(tripId);

  assert.equal(inspection.selectedTable, tripMessages);
  assert.equal(inspection.whereWasCalled, true);
  assert.equal(inspection.orderByArgumentCount, 2);
  assert.deepEqual(result, [userMessage, assistantMessage]);
});

test("preserves persistence failure causes", async () => {
  const databaseError = new Error("message insert failed");
  const { database } = createDatabaseDouble({ createError: databaseError });
  const repository = new PostgresTripMessageRepository(database);

  await assert.rejects(
    repository.createTurn(userMessage, assistantMessage),
    (error: unknown) => {
      assert.ok(error instanceof PostgresTripMessageRepositoryError);
      assert.equal(error.operation, "createTurn");
      assert.equal(error.cause, databaseError);
      return true;
    },
  );
});

test("persists and hydrates a recommendation presentation in the existing messages table", async () => {
  const presentation = { type: "destination_recommendations" as const, destinations: [
    { id: "a", name: "丽江市", province: "云南省", reason: "古城和雪山都在一天路程里" },
    { id: "b", name: "迪庆藏族自治州", province: "云南省", reason: "适合看高原草甸" },
    { id: "c", name: "甘孜藏族自治州", province: "四川省", reason: "川西环线的主要一段" },
  ] };
  const message: TripMessage = { ...assistantMessage, presentation };
  const rows: TripMessageRow[] = [{ ...message, presentation }];
  const { database, inspection } = createDatabaseDouble({ rows });
  const repository = new PostgresTripMessageRepository(database);
  await repository.createMessage(message);
  assert.deepEqual(inspection.insertedRows, message);
  assert.deepEqual(await repository.listByTripId(tripId), [message]);
});

test("persists and hydrates ambiguous location candidates in existing presentation JSONB", async () => {
  const presentation = { type: "location_candidates" as const, candidates: [
    { providerId: "poi-1", name: "吉林市", province: "吉林省", city: "吉林市", district: null,
      region: "吉林省", address: null, longitude: 126.55, latitude: 43.84, coordinateSystem: "GCJ-02" as const },
    { providerId: "poi-2", name: "吉林", province: null, city: null, district: null,
      region: "中国东北", address: null, longitude: 125.32, latitude: 43.89, coordinateSystem: "GCJ-02" as const },
  ] };
  const message: TripMessage = { ...assistantMessage, presentation };
  const { database, inspection } = createDatabaseDouble({ rows: [{ ...message, presentation }] });
  const repository = new PostgresTripMessageRepository(database);
  await repository.createMessage(message);
  assert.deepEqual(inspection.insertedRows, message);
  assert.deepEqual(await repository.listByTripId(tripId), [message]);
});

test("persists and hydrates a single location confirmation card", async () => {
  const presentation = { type: "location_candidates" as const, candidates: [
    { providerId: "poi-1", name: "潮州市", province: "广东省", city: "潮州市", district: null,
      region: "广东省", address: null, longitude: 116.62, latitude: 23.66, coordinateSystem: "GCJ-02" as const },
  ] };
  const message: TripMessage = { ...assistantMessage, presentation };
  const { database } = createDatabaseDouble({ rows: [{ ...message, presentation }] });
  const repository = new PostgresTripMessageRepository(database);
  await repository.createMessage(message);
  assert.deepEqual(await repository.listByTripId(tripId), [message]);
});

test("preserves the initial message insert failure cause", async () => {
  const databaseError = new Error("message insert failed");
  const { database } = createDatabaseDouble({ createError: databaseError });
  const repository = new PostgresTripMessageRepository(database);

  await assert.rejects(repository.createMessage(userMessage), (error: unknown) => {
    assert.ok(error instanceof PostgresTripMessageRepositoryError);
    assert.equal(error.operation, "createMessage");
    assert.equal(error.cause, databaseError);
    return true;
  });
});

function openingDatabaseDouble(winner: TripMessageRow | null) {
  const database = {
    insert() {
      return {
        values() {
          return {
            onConflictDoNothing() {
              return {
                async returning() {
                  return winner ? [] : [{ id: userMessage.id }];
                },
              };
            },
          };
        },
      };
    },
    select() {
      return {
        from() {
          return {
            where() {
              return { async limit() { return winner ? [winner] : []; } };
            },
          };
        },
      };
    },
  } as unknown as TripMessageDatabase;
  return database;
}

test("opening assistant insert uses the existing message ID primary key", async () => {
  const repository = new PostgresTripMessageRepository(openingDatabaseDouble(null));
  assert.deepEqual(await repository.createAssistantIfAbsent(assistantMessage), assistantMessage);
});

test("opening assistant insert returns the persisted conflict winner", async () => {
  const proposed: TripMessage = { ...assistantMessage, content: "candidate" };
  const persisted: TripMessageRow = { ...assistantMessage, presentation: null, content: "winner" };
  const repository = new PostgresTripMessageRepository(openingDatabaseDouble(persisted));

  assert.deepEqual(await repository.createAssistantIfAbsent(proposed), { ...assistantMessage, content: "winner" });
});

test("opening assistant insert rejects an unrelated ID conflict", async () => {
  const conflicting: TripMessageRow = { ...assistantMessage, presentation: null, role: "user" };
  const repository = new PostgresTripMessageRepository(openingDatabaseDouble(conflicting));

  await assert.rejects(
    repository.createAssistantIfAbsent(assistantMessage),
    PostgresTripMessageRepositoryError,
  );
});

function createUpdateDouble(updatedIds: { id: string }[]) {
  const calls = { table: undefined as unknown, set: undefined as unknown, whereCalled: false };
  const database = {
    update(table: unknown) {
      calls.table = table;
      return {
        set(values: unknown) {
          calls.set = values;
          return {
            where() {
              calls.whereCalled = true;
              return { async returning() { return updatedIds; } };
            },
          };
        },
      };
    },
  } as unknown as TripMessageDatabase;
  return { database, calls };
}

test("stores a card message's photos by replacing only its presentation", async () => {
  const presentation = { type: "destination_recommendations" as const, destinations: [
    { id: "a", name: "丽江市", province: "云南省", landmark: "玉龙雪山",
      image: { url: "https://store.is.autonavi.com/showpic/yl", caption: "玉龙雪山" } },
    { id: "b", name: "迪庆藏族自治州", province: "云南省", image: null },
  ] };
  const { database, calls } = createUpdateDouble([{ id: assistantMessage.id }]);
  await new PostgresTripMessageRepository(database).updateAssistantPresentation(tripId, assistantMessage.id, presentation);
  assert.equal(calls.table, tripMessages);
  assert.deepEqual(calls.set, { presentation });
  assert.equal(calls.whereCalled, true);
});

test("a photo update that matches no assistant message fails with its operation", async () => {
  const { database } = createUpdateDouble([]);
  await assert.rejects(
    new PostgresTripMessageRepository(database).updateAssistantPresentation(tripId, userMessage.id,
      { type: "destination_recommendations", destinations: [{ id: "a", name: "丽江市", province: "云南省" }] }),
    (error: unknown) => {
      assert.ok(error instanceof PostgresTripMessageRepositoryError);
      assert.equal(error.operation, "updateAssistantPresentation");
      return true;
    },
  );
});
