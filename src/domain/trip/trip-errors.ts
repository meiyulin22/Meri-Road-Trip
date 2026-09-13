export class InvalidTripInputError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Invalid Trip creation input: ${issues.join(" ")}`);
    this.name = "InvalidTripInputError";
    this.issues = issues;
  }
}

export class TripNotFoundError extends Error {
  readonly tripId: string;

  constructor(tripId: string) {
    super(`Trip ${tripId} was not found.`);
    this.name = "TripNotFoundError";
    this.tripId = tripId;
  }
}
