import { randomUUID } from "node:crypto";

import { TripNotFoundError } from "@/domain/trip/trip-errors";
import {
  type Trip,
  validateTripCreationInput,
} from "@/domain/trip/trip";
import type { TripRepository } from "@/repositories/trip-repository";

type TripServiceDependencies = {
  repository: TripRepository;
  generateId?: () => string;
  now?: () => Date;
};

export class TripService {
  private readonly repository: TripRepository;
  private readonly generateId: () => string;
  private readonly now: () => Date;

  constructor({
    repository,
    generateId = randomUUID,
    now = () => new Date(),
  }: TripServiceDependencies) {
    this.repository = repository;
    this.generateId = generateId;
    this.now = now;
  }

  async createTrip(input: unknown, ownerGuestId: string): Promise<Trip> {
    const creationInput = validateTripCreationInput(input);
    const timestamp = this.now().toISOString();

    const trip: Trip = {
      id: this.generateId(),
      status: creationInput.status ?? "idea",
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await this.repository.create(trip, ownerGuestId);

    return trip;
  }

  async getTripById(tripId: string, ownerGuestId: string): Promise<Trip> {
    const trip = await this.repository.findById(tripId, ownerGuestId);

    if (!trip) {
      throw new TripNotFoundError(tripId);
    }

    return trip;
  }
}
