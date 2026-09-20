import { eq } from "drizzle-orm";

import {
  validateTripState,
  type TripState,
} from "@/domain/trip-state/trip-state";
import type { TripStateRepository } from "@/repositories/trip-state-repository";
import { tripStates } from "@/server/database/schema/trip-states";

type TripStateDatabase = typeof import("@/server/database/db").db;
type TripStateRow = typeof tripStates.$inferSelect;

type PostgresTripStateOperation = "create" | "findByTripId" | "update";

export class PostgresTripStateRepositoryError extends Error {
  readonly operation: PostgresTripStateOperation;
  readonly tripId: string;

  constructor(
    operation: PostgresTripStateOperation,
    tripId: string,
    cause: unknown,
  ) {
    super(`Failed to ${operation} TripState for Trip ${tripId}.`, { cause });
    this.name = "PostgresTripStateRepositoryError";
    this.operation = operation;
    this.tripId = tripId;
  }
}

export class PostgresTripStateRepository implements TripStateRepository {
  constructor(
    private readonly database: TripStateDatabase,
    private readonly tripId: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async create(state: TripState): Promise<TripState> {
    const timestamp = this.now().toISOString();

    try {
      await this.database.insert(tripStates).values({
        tripId: this.tripId,
        state,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      return state;
    } catch (error) {
      throw new PostgresTripStateRepositoryError(
        "create",
        this.tripId,
        error,
      );
    }
  }

  async findByTripId(tripId: string): Promise<TripState | null> {
    try {
      const rows = await this.database
        .select()
        .from(tripStates)
        .where(eq(tripStates.tripId, tripId))
        .limit(1);
      const row = rows[0];

      return row ? toTripState(row) : null;
    } catch (error) {
      throw new PostgresTripStateRepositoryError(
        "findByTripId",
        tripId,
        error,
      );
    }
  }

  async update(state: TripState): Promise<void> {
    try {
      await this.database
        .update(tripStates)
        .set({ state, updatedAt: this.now().toISOString() })
        .where(eq(tripStates.tripId, this.tripId));
    } catch (error) {
      throw new PostgresTripStateRepositoryError(
        "update",
        this.tripId,
        error,
      );
    }
  }
}

function toTripState(row: TripStateRow): TripState {
  return validateTripState(row.state);
}
