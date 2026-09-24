import { desc, eq, sql } from "drizzle-orm";

import { validateTripState, type TripState, type TripStateField } from "@/domain/trip-state/trip-state";
import type { JourneySummary, JourneySummaryRepository } from "@/repositories/journey-summary-repository";
import { tripStates } from "@/server/database/schema/trip-states";
import { trips } from "@/server/database/schema/trips";

type JourneySummaryDatabase = typeof import("@/server/database/db").db;

export class PostgresJourneySummaryRepository implements JourneySummaryRepository {
  constructor(private readonly database: JourneySummaryDatabase) {}

  async listByOwner(ownerGuestId: string): Promise<JourneySummary[]> {
    const rows = await this.database
      .select({
        id: trips.id,
        status: trips.status,
        tripUpdatedAt: trips.updatedAt,
        state: tripStates.state,
        stateUpdatedAt: tripStates.updatedAt,
      })
      .from(trips)
      .innerJoin(tripStates, eq(tripStates.tripId, trips.id))
      .where(eq(trips.ownerGuestId, ownerGuestId))
      .orderBy(
        desc(sql`greatest(${trips.updatedAt}, ${tripStates.updatedAt})`),
        desc(trips.createdAt),
        desc(trips.id),
      );

    return rows.map((row) => {
      const state = validateTripState(row.state);
      return {
        id: row.id,
        name: titleFromState(state),
        destination: fieldText(state.destination),
        startDate: fieldText(state.startDate),
        endDate: fieldText(state.endDate),
        status: row.status,
        updatedAt: new Date(Math.max(
          new Date(row.tripUpdatedAt).getTime(),
          new Date(row.stateUpdatedAt).getTime(),
        )).toISOString(),
      };
    });
  }
}

function fieldText(field: TripStateField): string | null {
  return field.state === "missing" ? null : field.value;
}

function titleFromState(state: TripState): string {
  if (state.name.state !== "missing") {
    return state.name.value;
  }
  return "新的旅程想法";
}
