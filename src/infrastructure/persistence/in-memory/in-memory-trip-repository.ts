import type { Trip } from "@/domain/trip/trip";
import type { TripRepository } from "@/repositories/trip-repository";

export class InMemoryTripRepository implements TripRepository {
  private readonly trips = new Map<
    string,
    { readonly trip: Trip; readonly ownerGuestId: string }
  >();

  create(trip: Trip, ownerGuestId: string): Promise<Trip> {
    this.trips.set(trip.id, { trip, ownerGuestId });
    return Promise.resolve(trip);
  }

  findById(id: string, ownerGuestId: string): Promise<Trip | null> {
    const storedTrip = this.trips.get(id);
    return Promise.resolve(
      storedTrip?.ownerGuestId === ownerGuestId ? storedTrip.trip : null,
    );
  }

  listByOwner(ownerGuestId: string): Promise<Trip[]> {
    const ownedTrips = [...this.trips.values()]
      .filter((storedTrip) => storedTrip.ownerGuestId === ownerGuestId)
      .map((storedTrip) => storedTrip.trip)
      .sort(compareTripRecency);

    return Promise.resolve(ownedTrips);
  }

  update(trip: Trip, ownerGuestId: string): Promise<void> {
    const storedTrip = this.trips.get(trip.id);

    if (storedTrip?.ownerGuestId === ownerGuestId) {
      this.trips.set(trip.id, { trip, ownerGuestId });
    }

    return Promise.resolve();
  }
}

function compareTripRecency(left: Trip, right: Trip): number {
  return (
    right.updatedAt.localeCompare(left.updatedAt) ||
    right.createdAt.localeCompare(left.createdAt) ||
    right.id.localeCompare(left.id)
  );
}
