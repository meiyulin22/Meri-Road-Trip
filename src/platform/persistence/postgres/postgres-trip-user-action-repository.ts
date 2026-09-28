import { validateTripUserAction, type TripUserAction } from "@/domain/trip-user-action/trip-user-action";
import type { TripUserActionRepository } from "@/platform/persistence/trip-user-action-repository";
import { tripUserActions } from "@/platform/persistence/database/schema/trip-user-actions";

type Database = typeof import("@/platform/persistence/database/db").db;

export class PostgresTripUserActionRepository implements TripUserActionRepository {
  constructor(private readonly database: Database) {}

  async create(action: TripUserAction): Promise<TripUserAction> {
    try {
      const rows = await this.database.insert(tripUserActions).values(action).returning();
      return validateTripUserAction(rows[0]);
    } catch (error) {
      throw new Error(`Failed to persist TripUserAction for Trip ${action.tripId}.`, { cause: error });
    }
  }
}
