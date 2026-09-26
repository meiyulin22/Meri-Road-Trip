export const tripMessageRoles = ["user", "assistant"] as const;

export type TripMessageRole = (typeof tripMessageRoles)[number];

export interface DestinationRecommendationPresentation {
  readonly type: "destination_recommendations";
  readonly destinations: readonly {
    readonly id: string;
    readonly name: string;
    readonly region: string | null;
    readonly reason: string;
    readonly imageUrl: string | null;
  }[];
}

export interface TripMessage {
  readonly id: string;
  readonly tripId: string;
  readonly role: TripMessageRole;
  readonly content: string;
  readonly presentation?: DestinationRecommendationPresentation;
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
    expectedKeys.some((key) => !Object.hasOwn(value, key)) ||
    keys.some((key) => !expectedKeys.includes(key) && key !== "presentation")
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

  const presentation = Object.hasOwn(value, "presentation")
    ? validatePresentation(value.presentation, value.role)
    : undefined;

  return {
    id: value.id,
    tripId: value.tripId,
    role: value.role,
    content: value.content,
    ...(presentation ? { presentation } : {}),
    createdAt: new Date(value.createdAt).toISOString(),
  };
}

function validatePresentation(value: unknown, role: TripMessageRole): DestinationRecommendationPresentation {
  if (role !== "assistant" || !isRecord(value) ||
    Object.keys(value).length !== 2 || value.type !== "destination_recommendations" ||
    !Array.isArray(value.destinations) || value.destinations.length !== 3) {
    throw new InvalidTripMessageError("TripMessage.presentation is invalid.");
  }
  const destinations = value.destinations.map((item: unknown) => {
    if (!isRecord(item) || Object.keys(item).length !== 5 ||
      !["id", "name", "region", "reason", "imageUrl"].every((key) => Object.hasOwn(item, key)) ||
      !isPresentText(item.id) || !isPresentText(item.name) || !isPresentText(item.reason) ||
      !(item.region === null || isPresentText(item.region)) ||
      !(item.imageUrl === null || (typeof item.imageUrl === "string" && /^https:\/\//.test(item.imageUrl)))) {
      throw new InvalidTripMessageError("TripMessage.presentation destination is invalid.");
    }
    return { id: item.id, name: item.name, region: item.region, reason: item.reason, imageUrl: item.imageUrl };
  });
  if (new Set(destinations.map((item) => item.id)).size !== 3) {
    throw new InvalidTripMessageError("TripMessage.presentation IDs must be distinct.");
  }
  return { type: "destination_recommendations", destinations };
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
