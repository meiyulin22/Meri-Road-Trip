export class JourneyCreationError extends Error {
  constructor(message: string, cause: unknown) {
    super(message, { cause });
    this.name = "JourneyCreationError";
  }
}

export class TripStateNotFoundError extends Error {
  readonly tripId: string;

  constructor(tripId: string) {
    super(`TripState for Trip ${tripId} was not found.`);
    this.name = "TripStateNotFoundError";
    this.tripId = tripId;
  }
}
export class TripStateConflictError extends Error {
  constructor(tripId: string) {
    super(`TripState changed while updating Trip ${tripId}.`);
    this.name = "TripStateConflictError";
  }
}
