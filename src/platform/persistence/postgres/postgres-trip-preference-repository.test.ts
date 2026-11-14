import assert from "node:assert/strict";
import test from "node:test";

import type { TripPreference } from "@/domain/plan/trip-preference";
import { tripPreferences } from "@/platform/persistence/database/schema/trip-preferences";

import { PostgresTripPreferenceRepository, PostgresTripPreferenceRepositoryError } from "./postgres-trip-preference-repository";

type Database = ConstructorParameters<typeof PostgresTripPreferenceRepository>[0];

const preference: TripPreference = {
  id: "00000000-0000-4000-8000-000000000011", tripId: "3d17d2c7-fd9b-4748-b751-3a76a9a920be",
  label: "喜欢自然景观", kind: "interests", quote: "想去山川湖海", source: "conversation",
  messageId: "00000000-0000-4000-8000-000000000001", status: "active", createdAt: "2026-11-14T08:00:00.000Z",
};

function databaseDouble(options: { updated?: unknown[]; failInsert?: boolean } = {}) {
  const calls: string[] = [];
  let inserted: unknown;
  let set: unknown;
  const database = {
    delete(table: unknown) {
      assert.equal(table, tripPreferences);
      return { async where() { calls.push("delete"); } };
    },
    insert(table: unknown) {
      assert.equal(table, tripPreferences);
      return {
        async values(values: unknown) {
          calls.push("insert");
          inserted = values;
          if (options.failInsert) throw new Error("insert failed");
        },
      };
    },
    update(table: unknown) {
      assert.equal(table, tripPreferences);
      return {
        set(values: unknown) {
          set = values;
          return { where: () => ({ async returning() { calls.push("update"); return options.updated ?? []; } }) };
        },
      };
    },
  } as unknown as Database;
  return { database, calls, inserted: () => inserted, set: () => set };
}

test("replaces the conversation's active preferences with a new extraction", async () => {
  const double = databaseDouble();
  await new PostgresTripPreferenceRepository(double.database).replaceConversationPreferences(preference.tripId, [preference]);
  assert.deepEqual(double.calls, ["delete", "insert"]);
  assert.deepEqual(double.inserted(), [{ ...preference, updatedAt: preference.createdAt }]);

  const empty = databaseDouble();
  await new PostgresTripPreferenceRepository(empty.database).replaceConversationPreferences(preference.tripId, []);
  assert.deepEqual(empty.calls, ["delete"]);
});

test("marks a preference removed instead of deleting it, and names the failed operation", async () => {
  const double = databaseDouble({ updated: [{ id: preference.id }] });
  const repository = new PostgresTripPreferenceRepository(double.database);
  assert.equal(await repository.markRemoved(preference.tripId, preference.id, "2026-11-14T09:00:00.000Z"), true);
  assert.deepEqual(double.set(), { status: "removed", updatedAt: "2026-11-14T09:00:00.000Z" });
  assert.equal(await new PostgresTripPreferenceRepository(databaseDouble().database)
    .markRemoved(preference.tripId, preference.id, "2026-11-14T09:00:00.000Z"), false);

  await assert.rejects(new PostgresTripPreferenceRepository(databaseDouble({ failInsert: true }).database).create(preference),
    (error) => error instanceof PostgresTripPreferenceRepositoryError && error.operation === "create");
});
