import { randomUUID } from "node:crypto";

import { TripNotFoundError } from "@/domain/trip/trip-errors";
import {
  type Trip,
  validateTripCreationInput,
} from "@/domain/trip/trip";
import type { TripRepository } from "@/repositories/trip-repository";

type TripServiceDependencies = {
  repository: Pick<TripRepository, "create" | "findById">;
  generateId?: () => string;
  now?: () => Date;
};

export class TripService {
  private readonly repository: Pick<TripRepository, "create" | "findById">;
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

  async createTrip(input: unknown): Promise<Trip> {
    const creationInput = validateTripCreationInput(input);
    const timestamp = this.now().toISOString();

    const trip: Trip = {
      id: this.generateId(),
      name: creationInput.name,
      origin: creationInput.origin,
      destination: creationInput.destination,
      startDate: creationInput.startDate,
      endDate: creationInput.endDate,
      status: creationInput.status ?? "idea",
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await this.repository.create(trip);

    return trip;
  }

  async getTripById(tripId: string): Promise<Trip> {
    const trip = await this.repository.findById(tripId);

    if (!trip) {
      throw new TripNotFoundError(tripId);
    }

    return trip;
  }
}
