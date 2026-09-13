import type { Trip } from "@/domain/trip/trip";
import type { TripRepository } from "./trip-repository";

export class InMemoryTripRepository implements TripRepository {
  private readonly trips = new Map<string, Trip>();

  async save(trip: Trip): Promise<void> {
    this.trips.set(trip.id, trip);
  }

  async findById(tripId: string): Promise<Trip | null> {
    return this.trips.get(tripId) ?? null;
  }
}
