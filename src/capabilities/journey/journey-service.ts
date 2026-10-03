import {
  validateTripDraftDomain,
} from "@/domain/trip-draft/trip-draft";
import { InvalidTripMessageError, type TripMessagePresentation } from "@/domain/trip-message/trip-message";
import {
  applyTripStatePatch,
  initializeTripState,
  type TripState,
  type TripStatePatch,
  type DestinationField,
} from "@/domain/trip-state/trip-state";
import type { Trip } from "@/domain/trip/trip";
import type { TripStateRepository } from "@/platform/persistence/trip-state-repository";
import type { TripService } from "./trip-service";

import {
  JourneyCreationError,
  TripStateNotFoundError,
  TripStateConflictError,
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
  readonly persistOpeningAssistant?: (input: {
    readonly tripId: string;
    readonly ownerGuestId: string;
    readonly content: string;
    readonly presentation?: TripMessagePresentation;
  }) => Promise<unknown>;
}

export class JourneyService {
  constructor(private readonly dependencies: JourneyServiceDependencies) {}

  async createJourney(
    draftInput: unknown,
    ownerGuestId: string,
    initialUserMessage?: string,
    openingAssistant?: { readonly content: string; readonly presentation?: TripMessagePresentation },
    /** Places the first message named that the provider matched exactly. */
    initialDestination?: DestinationField,
  ): Promise<Journey> {
    const draft = validateTripDraftDomain(draftInput);
    if (initialUserMessage !== undefined &&
      (typeof initialUserMessage !== "string" || initialUserMessage.trim() === "")) {
      throw new InvalidTripMessageError("initialUserMessage must be non-empty text.");
    }
    const persistInitialUserMessage = this.dependencies.persistInitialUserMessage;
    const persistOpeningAssistant = this.dependencies.persistOpeningAssistant;
    if (initialUserMessage !== undefined && !persistInitialUserMessage) {
      throw new Error("Initial message persistence is not configured.");
    }
    if (openingAssistant && (!initialUserMessage || !persistOpeningAssistant)) {
      throw new Error("Opening assistant persistence requires an initial user message.");
    }
    const tripState = initialDestination === undefined
      ? initializeTripState(draft)
      : { ...initializeTripState(draft), destination: initialDestination };
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
      if (openingAssistant && persistOpeningAssistant) {
        await persistOpeningAssistant({
          tripId: trip.id,
          ownerGuestId,
          ...openingAssistant,
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
    expectedDestination?: DestinationField,
  ): Promise<TripState> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { tripState } = await this.loadJourney(tripId, ownerGuestId);
      if (expectedDestination !== undefined &&
        JSON.stringify(tripState.destination) !== JSON.stringify(expectedDestination)) {
        throw new TripStateConflictError(tripId);
      }
      const nextState = applyTripStatePatch(tripState, patch);
      const repository = this.dependencies.createTripStateRepository(tripId);
      if (repository.compareAndUpdate) {
        if (await repository.compareAndUpdate(tripState, nextState)) return nextState;
        continue;
      }
      await repository.update(nextState);
      return nextState;
    }
    throw new TripStateConflictError(tripId);
  }
}
