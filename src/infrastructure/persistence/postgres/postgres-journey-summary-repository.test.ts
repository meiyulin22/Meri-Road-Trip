import assert from "node:assert/strict";
import test from "node:test";
import { PgDialect } from "drizzle-orm/pg-core";

import type { TripState } from "@/domain/trip-state/trip-state";
import { tripStates } from "@/server/database/schema/trip-states";
import { trips } from "@/server/database/schema/trips";

import { PostgresJourneySummaryRepository } from "./postgres-journey-summary-repository";

const guestA = "25ba5b26-8db0-4fe3-bfcc-b684dd7889cc";
const guestB = "f6dd6c50-91c6-4ad1-9089-dbb3feaa61cc";

const state: TripState = {
  name: { state: "known", value: "北方之旅", source: "user" },
  origin: { state: "missing" },
  destination: { state: "known", value: "大连", source: "user" },
  startDate: { state: "approximate", value: "十月初", source: "user" },
  endDate: { state: "missing" },
  duration: { state: "missing" },
  transportPreference: { state: "missing" },
};

type SummaryRow = {
  id: string;
  ownerGuestId: string;
  status: "idea" | "planning";
  tripUpdatedAt: string;
  state: TripState;
  stateUpdatedAt: string;
};

function createDatabaseDouble(rows: SummaryRow[]) {
  let ownerFilter = "";
  let joinedState = false;
  let orderedByLatestUpdate = false;
  const dialect = new PgDialect();
  const database = {
    select() {
      return {
        from(table: unknown) {
          assert.equal(table, trips);
          return {
            innerJoin(tableToJoin: unknown) {
              joinedState = tableToJoin === tripStates;
              return {
                where(condition: Parameters<PgDialect["sqlToQuery"]>[0]) {
                  const query = dialect.sqlToQuery(condition);
                  assert.match(query.sql, /owner_guest_id/);
                  ownerFilter = String(query.params[0]);
                  return {
                    async orderBy(...order: Parameters<PgDialect["sqlToQuery"]>[0][]) {
                      orderedByLatestUpdate = dialect.sqlToQuery(order[0]).sql.includes("greatest");
                      return rows.filter((row) => row.ownerGuestId === ownerFilter);
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  } as unknown as ConstructorParameters<typeof PostgresJourneySummaryRepository>[0];

  return {
    repository: new PostgresJourneySummaryRepository(database),
    inspection: {
      get ownerFilter() { return ownerFilter; },
      get joinedState() { return joinedState; },
      get orderedByLatestUpdate() { return orderedByLatestUpdate; },
    },
  };
}

test("projects current TripState without updating stale Trip fields", async () => {
  const row: SummaryRow = {
    id: "3d17d2c7-fd9b-4748-b751-3a76a9a920be",
    ownerGuestId: guestA,
    status: "idea",
    tripUpdatedAt: "2026-09-21T08:00:00.000Z",
    state: { ...state, destination: { state: "missing" } },
    stateUpdatedAt: "2026-09-21T08:00:01.000Z",
  };
  const { repository, inspection } = createDatabaseDouble([row]);

  assert.equal((await repository.listByOwner(guestA))[0].destination, null);
  row.state = state;
  row.stateUpdatedAt = "2026-09-23T08:00:00.000Z";
  const [summary] = await repository.listByOwner(guestA);

  assert.deepEqual(summary, {
    id: row.id,
    name: "北方之旅",
    destination: "大连",
    startDate: "十月初",
    endDate: null,
    status: "idea",
    updatedAt: "2026-09-23T08:00:00.000Z",
  });
  assert.equal(row.tripUpdatedAt, "2026-09-21T08:00:00.000Z");
  assert.equal(inspection.joinedState, true);
  assert.equal(inspection.orderedByLatestUpdate, true);
});

test("filters by Trip owner and keeps missing TripState fields missing", async () => {
  const row: SummaryRow = {
    id: "3d17d2c7-fd9b-4748-b751-3a76a9a920be",
    ownerGuestId: guestA,
    status: "planning",
    tripUpdatedAt: "2026-09-23T08:00:00.000Z",
    state: {
      ...state,
      name: { state: "missing" },
      destination: { state: "missing" },
      startDate: { state: "missing" },
    },
    stateUpdatedAt: "2026-09-22T08:00:00.000Z",
  };
  const { repository, inspection } = createDatabaseDouble([row]);

  assert.deepEqual(await repository.listByOwner(guestB), []);
  const [summary] = await repository.listByOwner(guestA);
  assert.equal(inspection.ownerFilter, guestA);
  assert.equal(summary.name, "新的旅程想法");
  assert.equal(summary.destination, null);
  assert.equal(summary.startDate, null);
  assert.equal(summary.status, "planning");
  assert.equal(summary.updatedAt, row.tripUpdatedAt);

  row.state = {
    ...row.state,
    destination: { state: "known", value: "东京", source: "user" },
  };
  const [legacySummary] = await repository.listByOwner(guestA);
  assert.equal(legacySummary.name, "新的旅程想法");
});
