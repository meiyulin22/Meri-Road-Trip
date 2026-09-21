import {
  validateTripDraftDomain,
  type TripDraft,
  type TripDraftField,
} from "@/domain/trip-draft/trip-draft";
import {
  applyTripStatePatch,
  initializeTripState,
  type TripState,
  type TripStatePatch,
} from "@/domain/trip-state/trip-state";
import type { Trip } from "@/domain/trip/trip";
import type { TripStateRepository } from "@/repositories/trip-state-repository";
import type { TripService } from "@/server/trip/trip-service";

import {
  JourneyCreationError,
  TripStateNotFoundError,
} from "./journey-errors";

export interface Journey {
  readonly trip: Trip;
  readonly tripState: TripState;
}

interface JourneyServiceDependencies {
  readonly tripService: Pick<TripService, "createTrip" | "getTripById">;
  readonly createTripStateRepository: (tripId: string) => TripStateRepository;
  readonly deleteTripById: (
    tripId: string,
    ownerGuestId: string,
  ) => Promise<void>;
}

export class JourneyService {
  constructor(private readonly dependencies: JourneyServiceDependencies) {}

  async createJourney(
    draftInput: unknown,
    ownerGuestId: string,
  ): Promise<Journey> {
    const draft = validateTripDraftDomain(draftInput);
    const tripState = initializeTripState(draft);
    const trip = await this.dependencies.tripService.createTrip(
      createTripInput(draft),
      ownerGuestId,
    );

    try {
      await this.dependencies
        .createTripStateRepository(trip.id)
        .create(tripState);
    } catch (stateError) {
      try {
        await this.dependencies.deleteTripById(trip.id, ownerGuestId);
      } catch (cleanupError) {
        throw new JourneyCreationError(
          `Failed to create TripState and roll back Trip ${trip.id}.`,
          new AggregateError([stateError, cleanupError]),
        );
      }

      throw new JourneyCreationError(
        `Failed to create TripState for Trip ${trip.id}; Trip creation was rolled back.`,
        stateError,
      );
    }

    return { trip, tripState };
  }

  async loadJourney(
    tripId: string,
    ownerGuestId: string,
  ): Promise<Journey> {
    const trip = await this.dependencies.tripService.getTripById(
      tripId,
      ownerGuestId,
    );
    const tripState = await this.dependencies
      .createTripStateRepository(tripId)
      .findByTripId(tripId);

    if (tripState === null) {
      throw new TripStateNotFoundError(tripId);
    }

    return { trip, tripState };
  }

  async updateTripState(
    tripId: string,
    ownerGuestId: string,
    patch: TripStatePatch,
  ): Promise<TripState> {
    const { tripState } = await this.loadJourney(tripId, ownerGuestId);
    const nextState = applyTripStatePatch(tripState, patch);
    await this.dependencies
      .createTripStateRepository(tripId)
      .update(nextState);
    return nextState;
  }
}

function createTripInput(draft: TripDraft) {
  return {
    name: fieldText(draft.name) ?? "新的旅程想法",
    origin: fieldText(draft.origin),
    destination: fieldText(draft.destination),
    startDate: knownIsoDate(draft.startDate),
    endDate: knownIsoDate(draft.endDate),
  };
}

function fieldText(field: TripDraftField): string | null {
  return field.state === "missing" ? null : field.value;
}

function knownIsoDate(field: TripDraftField): string | null {
  if (field.state !== "known" || !/^\d{4}-\d{2}-\d{2}$/.test(field.value)) {
    return null;
  }

  const date = new Date(`${field.value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === field.value
    ? field.value
    : null;
}
