import type { Trip } from "@/domain/trip/trip";

export interface TripRepository {
  create(trip: Trip, ownerGuestId: string): Promise<Trip>;
  findById(id: string, ownerGuestId: string): Promise<Trip | null>;
  update(trip: Trip, ownerGuestId: string): Promise<void>;
}
