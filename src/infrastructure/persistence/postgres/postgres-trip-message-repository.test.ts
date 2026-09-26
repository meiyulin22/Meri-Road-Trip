import assert from "node:assert/strict";
import test from "node:test";

import type { TripMessage } from "@/domain/trip-message/trip-message";
import { tripMessages } from "@/server/database/schema/trip-messages";

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
    { id: "a", name: "甲", region: null, reason: "一", imageUrl: "https://amap.example/photo.jpg" },
    { id: "b", name: "乙", region: null, reason: "二", imageUrl: null },
    { id: "c", name: "丙", region: null, reason: "三", imageUrl: null },
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
    { providerId: "poi-1", name: "吉林市", region: "吉林省", address: null,
      longitude: 126.55, latitude: 43.84, coordinateSystem: "GCJ-02" as const },
    { providerId: "poi-2", name: "吉林", region: "中国东北", address: null,
      longitude: 125.32, latitude: 43.89, coordinateSystem: "GCJ-02" as const },
  ] };
  const message: TripMessage = { ...assistantMessage, presentation };
  const { database, inspection } = createDatabaseDouble({ rows: [{ ...message, presentation }] });
  const repository = new PostgresTripMessageRepository(database);
  await repository.createMessage(message);
  assert.deepEqual(inspection.insertedRows, message);
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
