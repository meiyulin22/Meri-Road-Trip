import type { Trip } from "@/domain/trip/trip";

export interface TripRepository {
  create(trip: Trip): Promise<Trip>;
  findById(id: string): Promise<Trip | null>;
  update(trip: Trip): Promise<void>;
}
