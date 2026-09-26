import assert from "node:assert/strict";
import test from "node:test";

import type { TripUserAction } from "@/domain/trip-user-action/trip-user-action";
import { tripUserActions } from "@/server/database/schema/trip-user-actions";
import { PostgresTripUserActionRepository } from "./postgres-trip-user-action-repository";

const action: TripUserAction = {
  id: "00000000-0000-4000-8000-000000000005",
  tripId: "3d17d2c7-fd9b-4748-b751-3a76a9a920be",
  type: "request_destination_recommendations",
  createdAt: "2026-09-26T00:00:00.000Z",
};

test("repository inserts the narrow action and returns the persisted row", async () => {
  let table: unknown;
  let inserted: unknown;
  const persisted = { ...action, createdAt: "2026-09-26T00:00:01.000Z" };
  const database = {
    insert(value: unknown) {
      table = value;
      return {
        values(value: unknown) {
          inserted = value;
          return { async returning() { return [persisted]; } };
        },
      };
    },
  } as unknown as ConstructorParameters<typeof PostgresTripUserActionRepository>[0];
  const result = await new PostgresTripUserActionRepository(database).create(action);
  assert.equal(table, tripUserActions);
  assert.deepEqual(inserted, action);
  assert.deepEqual(result, persisted);
});

test("repository keeps database failure as cause", async () => {
  const failure = new Error("database unavailable");
  const database = {
    insert() { throw failure; },
  } as unknown as ConstructorParameters<typeof PostgresTripUserActionRepository>[0];
  await assert.rejects(new PostgresTripUserActionRepository(database).create(action),
    (error: unknown) => error instanceof Error && error.cause === failure);
});
