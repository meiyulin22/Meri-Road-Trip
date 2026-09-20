import { eq } from "drizzle-orm";

import type { Trip } from "@/domain/trip/trip";
import { trips } from "@/server/database/schema/trips";

type TripDatabase = typeof import("@/server/database/db").db;
type TripRow = typeof trips.$inferSelect;
type TripInsert = typeof trips.$inferInsert;

type PostgresTripOperation = "save" | "findById" | "deleteById";

export class PostgresTripRepositoryError extends Error {
  readonly operation: PostgresTripOperation;
  readonly tripId: string;

  constructor(operation: PostgresTripOperation, tripId: string, cause: unknown) {
    const action =
      operation === "save"
        ? "save"
        : operation === "deleteById"
          ? "delete"
          : "find";

    super(`Failed to ${action} Trip ${tripId} in PostgreSQL.`, { cause });
    this.name = "PostgresTripRepositoryError";
    this.operation = operation;
    this.tripId = tripId;
  }
}

export class PostgresTripRepository {
  constructor(private readonly database: TripDatabase) {}

  async create(trip: Trip): Promise<Trip> {
    await this.save(trip);
    return trip;
  }

  async save(trip: Trip): Promise<void> {
    try {
      await this.database.insert(trips).values(toTripInsert(trip));
    } catch (error) {
      throw new PostgresTripRepositoryError("save", trip.id, error);
    }
  }

  async findById(tripId: string): Promise<Trip | null> {
    try {
      const rows = await this.database
        .select()
        .from(trips)
        .where(eq(trips.id, tripId))
        .limit(1);
      const row = rows[0];

      return row ? toTrip(row) : null;
    } catch (error) {
      throw new PostgresTripRepositoryError("findById", tripId, error);
    }
  }

  async deleteById(tripId: string): Promise<void> {
    try {
      await this.database.delete(trips).where(eq(trips.id, tripId));
    } catch (error) {
      throw new PostgresTripRepositoryError("deleteById", tripId, error);
    }
  }
}

function toTripInsert(trip: Trip): TripInsert {
  return {
    id: trip.id,
    name: trip.name,
    origin: trip.origin,
    destination: trip.destination,
    startDate: trip.startDate,
    endDate: trip.endDate,
    status: trip.status,
    createdAt: trip.createdAt,
    updatedAt: trip.updatedAt,
  };
}

function toTrip(row: TripRow): Trip {
  return {
    id: row.id,
    name: row.name,
    origin: row.origin,
    destination: row.destination,
    startDate: row.startDate,
    endDate: row.endDate,
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
