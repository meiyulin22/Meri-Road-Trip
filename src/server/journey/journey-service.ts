import {
  validateTripDraftDomain,
} from "@/domain/trip-draft/trip-draft";
import { InvalidTripMessageError } from "@/domain/trip-message/trip-message";
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
  ) => Promise<boolean>;
  readonly persistInitialUserMessage?: (input: {
    readonly tripId: string;
    readonly ownerGuestId: string;
    readonly content: string;
  }) => Promise<unknown>;
}

export class JourneyService {
  constructor(private readonly dependencies: JourneyServiceDependencies) {}

  async createJourney(
    draftInput: unknown,
    ownerGuestId: string,
    initialUserMessage?: string,
  ): Promise<Journey> {
    const draft = validateTripDraftDomain(draftInput);
    if (initialUserMessage !== undefined &&
      (typeof initialUserMessage !== "string" || initialUserMessage.trim() === "")) {
      throw new InvalidTripMessageError("initialUserMessage must be non-empty text.");
    }
    const persistInitialUserMessage = this.dependencies.persistInitialUserMessage;
    if (initialUserMessage !== undefined && !persistInitialUserMessage) {
      throw new Error("Initial message persistence is not configured.");
    }
    const tripState = initializeTripState(draft);
    const trip = await this.dependencies.tripService.createTrip({}, ownerGuestId);

    try {
      await this.dependencies
        .createTripStateRepository(trip.id)
        .create(tripState);
      if (initialUserMessage !== undefined && persistInitialUserMessage) {
        await persistInitialUserMessage({
          tripId: trip.id,
          ownerGuestId,
          content: initialUserMessage,
        });
      }
    } catch (creationError) {
      try {
        const deleted = await this.dependencies.deleteTripById(
          trip.id,
          ownerGuestId,
        );
        if (!deleted) {
          throw new Error(
            `Trip ${trip.id} was not deleted during creation rollback.`,
          );
        }
      } catch (cleanupError) {
        throw new JourneyCreationError(
          `Failed to complete Journey creation and roll back Trip ${trip.id}.`,
          new AggregateError([creationError, cleanupError]),
        );
      }

      throw new JourneyCreationError(
        `Failed to complete Journey creation for Trip ${trip.id}; Trip creation was rolled back.`,
        creationError,
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

  deleteJourney(tripId: string, ownerGuestId: string): Promise<boolean> {
    return this.dependencies.deleteTripById(tripId, ownerGuestId);
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
