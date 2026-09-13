import type { Trip } from "@/domain/trip/trip";

export interface TripRepository {
  save(trip: Trip): Promise<void>;
  findById(tripId: string): Promise<Trip | null>;
}
