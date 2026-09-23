import { and, eq } from "drizzle-orm";

import type { Trip } from "@/domain/trip/trip";
import { trips } from "@/server/database/schema/trips";

type TripDatabase = typeof import("@/server/database/db").db;
type TripRow = typeof trips.$inferSelect;
type TripInsert = typeof trips.$inferInsert;

type PostgresTripOperation = "save" | "findById" | "deleteById";

export class PostgresTripRepositoryError extends Error {
  readonly operation: PostgresTripOperation;
  readonly tripId: string;

  constructor(
    operation: PostgresTripOperation,
    tripId: string,
    cause: unknown,
  ) {
    const action =
      operation === "save"
        ? "save"
        : operation === "deleteById"
          ? "delete"
        : "find";

    const target = `Trip ${tripId}`;

    super(`Failed to ${action} ${target} in PostgreSQL.`, { cause });
    this.name = "PostgresTripRepositoryError";
    this.operation = operation;
    this.tripId = tripId;
  }
}

export class PostgresTripRepository {
  constructor(private readonly database: TripDatabase) {}

  async create(trip: Trip, ownerGuestId: string): Promise<Trip> {
    await this.save(trip, ownerGuestId);
    return trip;
  }

  async save(trip: Trip, ownerGuestId: string): Promise<void> {
    try {
      await this.database.insert(trips).values(toTripInsert(trip, ownerGuestId));
    } catch (error) {
      throw new PostgresTripRepositoryError("save", trip.id, error);
    }
  }

  async findById(tripId: string, ownerGuestId: string): Promise<Trip | null> {
    try {
      const rows = await this.database
        .select()
        .from(trips)
        .where(
          and(
            eq(trips.id, tripId),
            eq(trips.ownerGuestId, ownerGuestId),
          ),
        )
        .limit(1);
      const row = rows[0];

      return row ? toTrip(row) : null;
    } catch (error) {
      throw new PostgresTripRepositoryError("findById", tripId, error);
    }
  }

  async deleteById(tripId: string, ownerGuestId: string): Promise<boolean> {
    try {
      const deleted = await this.database
        .delete(trips)
        .where(
          and(
            eq(trips.id, tripId),
            eq(trips.ownerGuestId, ownerGuestId),
          ),
        )
        .returning({ id: trips.id });
      return deleted.length === 1;
    } catch (error) {
      throw new PostgresTripRepositoryError("deleteById", tripId, error);
    }
  }
}

function toTripInsert(trip: Trip, ownerGuestId: string): TripInsert {
  return {
    id: trip.id,
    ownerGuestId,
    status: trip.status,
    createdAt: trip.createdAt,
    updatedAt: trip.updatedAt,
  };
}

function toTrip(row: TripRow): Trip {
  return {
    id: row.id,
    status: row.status,
    createdAt: toIsoTimestamp(row.createdAt, "created_at"),
    updatedAt: toIsoTimestamp(row.updatedAt, "updated_at"),
  };
}

function toIsoTimestamp(value: string, columnName: string): string {
  const timestamp = new Date(value);

  if (Number.isNaN(timestamp.getTime())) {
    throw new Error(`PostgreSQL returned an invalid ${columnName} timestamp.`);
  }

  return timestamp.toISOString();
}
