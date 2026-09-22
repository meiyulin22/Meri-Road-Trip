export const tripMessageRoles = ["user", "assistant"] as const;

export type TripMessageRole = (typeof tripMessageRoles)[number];

export interface TripMessage {
  readonly id: string;
  readonly tripId: string;
  readonly role: TripMessageRole;
  readonly content: string;
  readonly createdAt: string;
}

export class InvalidTripMessageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidTripMessageError";
  }
}

export function validateTripMessage(value: unknown): TripMessage {
  if (!isRecord(value)) {
    throw new InvalidTripMessageError("TripMessage must be an object.");
  }

  const keys = Object.keys(value);
  const expectedKeys = ["id", "tripId", "role", "content", "createdAt"];
  if (
    keys.length !== expectedKeys.length ||
    expectedKeys.some((key) => !Object.hasOwn(value, key))
  ) {
    throw new InvalidTripMessageError("TripMessage has an invalid shape.");
  }

  if (!isPresentText(value.id)) {
    throw new InvalidTripMessageError("TripMessage.id is invalid.");
  }

  if (!isPresentText(value.tripId)) {
    throw new InvalidTripMessageError("TripMessage.tripId is invalid.");
  }

  if (!isTripMessageRole(value.role)) {
    throw new InvalidTripMessageError("TripMessage.role is invalid.");
  }

  if (!isPresentText(value.content)) {
    throw new InvalidTripMessageError("TripMessage.content is invalid.");
  }

  if (!isIsoTimestamp(value.createdAt)) {
    throw new InvalidTripMessageError("TripMessage.createdAt is invalid.");
  }

  return {
    id: value.id,
    tripId: value.tripId,
    role: value.role,
    content: value.content,
    createdAt: new Date(value.createdAt).toISOString(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPresentText(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function isTripMessageRole(value: unknown): value is TripMessageRole {
  return (
    typeof value === "string" &&
    tripMessageRoles.some((role) => role === value)
  );
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }

  const timestamp = new Date(value);
  return !Number.isNaN(timestamp.getTime());
}
