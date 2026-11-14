import type { TripPreference } from "@/domain/plan/trip-preference";

export interface TripPreferenceRepository {
  /** Every preference of the trip, removed ones included, oldest first. */
  listByTripId(tripId: string): Promise<TripPreference[]>;
  /**
   * Swaps the active preferences taken from the conversation for a new extraction.
   * Removed ones stay, so a preference the traveller deleted is not extracted back.
   * Two writes without a transaction (the Neon HTTP driver has none): a failure between
   * them loses the old extraction, which the next handoff rebuilds.
   */
  replaceConversationPreferences(tripId: string, preferences: readonly TripPreference[]): Promise<void>;
  create(preference: TripPreference): Promise<void>;
  /** False when the trip has no such active preference. */
  markRemoved(tripId: string, preferenceId: string, at: string): Promise<boolean>;
}
