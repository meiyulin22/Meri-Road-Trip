import type { Trip } from "@/domain/trip/trip";
import type { TripRepository } from "@/repositories/trip-repository";

export class InMemoryTripRepository implements TripRepository {
  private readonly trips = new Map<string, Trip>();

  create(trip: Trip): Promise<Trip> {
    this.trips.set(trip.id, trip);
    return Promise.resolve(trip);
  }

  findById(id: string): Promise<Trip | null> {
    return Promise.resolve(this.trips.get(id) ?? null);
  }

  update(trip: Trip): Promise<void> {
    this.trips.set(trip.id, trip);
    return Promise.resolve();
  }
}
