import { and, asc, eq } from "drizzle-orm";

import type { TripPreference } from "@/domain/plan/trip-preference";
import { tripPreferences } from "@/platform/persistence/database/schema/trip-preferences";
import type { TripPreferenceRepository } from "@/platform/persistence/trip-preference-repository";

type TripPreferenceDatabase = typeof import("@/platform/persistence/database/db").db;
type TripPreferenceRow = typeof tripPreferences.$inferSelect;

type PostgresTripPreferenceOperation = "listByTripId" | "replaceConversationPreferences" | "create" | "markRemoved";

export class PostgresTripPreferenceRepositoryError extends Error {
  readonly operation: PostgresTripPreferenceOperation;
  readonly tripId: string;

  constructor(operation: PostgresTripPreferenceOperation, tripId: string, cause: unknown) {
    super(`Failed to ${operation} for Trip ${tripId}.`, { cause });
    this.name = "PostgresTripPreferenceRepositoryError";
    this.operation = operation;
    this.tripId = tripId;
  }
}

function toRow(preference: TripPreference) {
  return { ...preference, updatedAt: preference.createdAt };
}

/** Postgres returns timestamptz as "2026-11-15 05:21:47.089+00"; the handoff requires ISO time. */
function isoTime(value: string): string {
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) throw new Error("PostgreSQL returned an invalid preference timestamp.");
  return time.toISOString();
}

function toPreference(row: TripPreferenceRow): TripPreference {
  const { id, tripId, label, kind, pace, quote, source, messageId, status, createdAt } = row;
  return { id, tripId, label, kind, pace, quote, source, messageId, status, createdAt: isoTime(createdAt) };
}

export class PostgresTripPreferenceRepository implements TripPreferenceRepository {
  constructor(private readonly database: TripPreferenceDatabase) {}

  async listByTripId(tripId: string): Promise<TripPreference[]> {
    try {
      const rows = await this.database.select().from(tripPreferences)
        .where(eq(tripPreferences.tripId, tripId))
        .orderBy(asc(tripPreferences.createdAt), asc(tripPreferences.id));
      return rows.map(toPreference);
    } catch (error) {
      throw new PostgresTripPreferenceRepositoryError("listByTripId", tripId, error);
    }
  }

  async replaceConversationPreferences(tripId: string, preferences: readonly TripPreference[]): Promise<void> {
    try {
      await this.database.delete(tripPreferences).where(and(
        eq(tripPreferences.tripId, tripId),
        eq(tripPreferences.source, "conversation"),
        eq(tripPreferences.status, "active"),
      ));
      if (preferences.length > 0) await this.database.insert(tripPreferences).values(preferences.map(toRow));
    } catch (error) {
      throw new PostgresTripPreferenceRepositoryError("replaceConversationPreferences", tripId, error);
    }
  }

  async create(preference: TripPreference): Promise<void> {
    try {
      await this.database.insert(tripPreferences).values(toRow(preference));
    } catch (error) {
      throw new PostgresTripPreferenceRepositoryError("create", preference.tripId, error);
    }
  }

  async markRemoved(tripId: string, preferenceId: string, at: string): Promise<boolean> {
    try {
      const updated = await this.database.update(tripPreferences)
        .set({ status: "removed", updatedAt: at })
        .where(and(
          eq(tripPreferences.id, preferenceId),
          eq(tripPreferences.tripId, tripId),
          eq(tripPreferences.status, "active"),
        ))
        .returning({ id: tripPreferences.id });
      return updated.length > 0;
    } catch (error) {
      throw new PostgresTripPreferenceRepositoryError("markRemoved", tripId, error);
    }
  }
}
