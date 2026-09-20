import type { TripState } from "@/domain/trip-state/trip-state";
import type { TripStateRepository } from "@/repositories/trip-state-repository";

export class InMemoryTripStateRepository implements TripStateRepository {
  private readonly states = new Map<string, TripState>();

  constructor(private readonly tripId: string) {}

  create(state: TripState): Promise<TripState> {
    this.states.set(this.tripId, state);
    return Promise.resolve(state);
  }

  findByTripId(tripId: string): Promise<TripState | null> {
    return Promise.resolve(this.states.get(tripId) ?? null);
  }

  update(state: TripState): Promise<void> {
    this.states.set(this.tripId, state);
    return Promise.resolve();
  }
}
