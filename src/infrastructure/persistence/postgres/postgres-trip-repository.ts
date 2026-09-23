import { and, desc, eq } from "drizzle-orm";

import type { Trip } from "@/domain/trip/trip";
import { trips } from "@/server/database/schema/trips";

type TripDatabase = typeof import("@/server/database/db").db;
type TripRow = typeof trips.$inferSelect;
type TripInsert = typeof trips.$inferInsert;

type PostgresTripOperation =
  | "save"
  | "findById"
  | "listByOwner"
  | "deleteById";

export class PostgresTripRepositoryError extends Error {
  readonly operation: PostgresTripOperation;
  readonly tripId: string | null;

  constructor(
    operation: PostgresTripOperation,
    tripId: string | null,
    cause: unknown,
  ) {
    const action =
      operation === "save"
        ? "save"
        : operation === "deleteById"
          ? "delete"
          : operation === "listByOwner"
            ? "list"
            : "find";

    const target = operation === "listByOwner" ? "Trips" : `Trip ${tripId}`;

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

  async listByOwner(ownerGuestId: string): Promise<Trip[]> {
    try {
      const rows = await this.database
        .select()
        .from(trips)
        .where(eq(trips.ownerGuestId, ownerGuestId))
        .orderBy(
          desc(trips.updatedAt),
          desc(trips.createdAt),
          desc(trips.id),
        );

      return rows.map(toTrip);
    } catch (error) {
      throw new PostgresTripRepositoryError("listByOwner", null, error);
    }
  }

  async deleteById(tripId: string, ownerGuestId: string): Promise<void> {
    try {
      await this.database
        .delete(trips)
        .where(
          and(
            eq(trips.id, tripId),
            eq(trips.ownerGuestId, ownerGuestId),
          ),
        );
    } catch (error) {
      throw new PostgresTripRepositoryError("deleteById", tripId, error);
    }
  }
}

function toTripInsert(trip: Trip, ownerGuestId: string): TripInsert {
  return {
    id: trip.id,
    ownerGuestId,
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
