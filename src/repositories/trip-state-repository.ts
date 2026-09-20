import type { TripState } from "@/domain/trip-state/trip-state";

export interface TripStateRepository {
  create(state: TripState): Promise<TripState>;
  findByTripId(tripId: string): Promise<TripState | null>;
  update(state: TripState): Promise<void>;
}
