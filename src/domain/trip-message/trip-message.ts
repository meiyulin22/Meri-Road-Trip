import type { LocationCandidate } from "@/domain/location/location";

export const tripMessageRoles = ["user", "assistant"] as const;

export type TripMessageRole = (typeof tripMessageRoles)[number];

export interface DestinationRecommendationPresentation {
  readonly type: "destination_recommendations";
  /**
   * Places to pick from, a 市 at the finest: 「云南省 丽江市」 is something a plan can
   * be built for, 「云南」 is not, and which 景点 inside 丽江 is Generate plan's
   * question rather than this one. Several are picked at once, so the list is
   * longer than the three cards that used to be offered, and the province is what
   * groups it on screen.
   */
  readonly destinations: readonly {
    readonly id: string;
    readonly name: string;
    readonly province: string | null;
    readonly reason: string;
  }[];
}

export interface LocationCandidatesPresentation {
  readonly type: "location_candidates";
  readonly candidates: readonly LocationCandidate[];
}

export type TripMessagePresentation = DestinationRecommendationPresentation | LocationCandidatesPresentation;

export interface TripMessage {
  readonly id: string;
  readonly tripId: string;
  readonly role: TripMessageRole;
  readonly content: string;
  readonly presentation?: TripMessagePresentation;
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

function validatePresentation(value: unknown, role: TripMessageRole): TripMessagePresentation {
  if (role !== "assistant" || !isRecord(value) || Object.keys(value).length !== 2) {
    throw new InvalidTripMessageError("TripMessage.presentation is invalid.");
  }
  if (value.type === "location_candidates") {
    if (!Array.isArray(value.candidates) || value.candidates.length < 1) {
      throw new InvalidTripMessageError("TripMessage location candidates are invalid.");
    }
    const candidates = value.candidates.map(validateLocationCandidate);
    const identities = candidates.map((candidate) =>
      `${candidate.providerId}:${candidate.longitude},${candidate.latitude}`);
    if (new Set(identities).size !== identities.length) {
      throw new InvalidTripMessageError("TripMessage location candidates must be distinct.");
    }
    return { type: "location_candidates", candidates };
  }
  if (value.type !== "destination_recommendations" ||
    !Array.isArray(value.destinations) || value.destinations.length < 1 ||
    value.destinations.length > maxDestinationRecommendations) {
    throw new InvalidTripMessageError("TripMessage.presentation is invalid.");
  }
  const destinations = value.destinations.map((item: unknown) => {
    if (!isRecord(item) || !hasKnownKeys(item, recommendationKeys, legacyRecommendationKeys) ||
      !isPresentText(item.id) || !isPresentText(item.name) || !isPresentText(item.reason) ||
      [item.province, item.region].some((level) =>
        !(level === undefined || level === null || isPresentText(level)))) {
      throw new InvalidTripMessageError("TripMessage.presentation destination is invalid.");
    }
    return { id: item.id, name: item.name, reason: item.reason,
      province: storedAreaLevel(item.province) ?? storedAreaLevel(item.region) };
  });
  if (new Set(destinations.map((item) => item.id)).size !== destinations.length) {
    throw new InvalidTripMessageError("TripMessage.presentation IDs must be distinct.");
  }
  return { type: "destination_recommendations", destinations };
}

/**
 * Picking several places at once is what makes a regional trip expressible, so the
 * list is no longer three cards long. Twelve is where a grouped list stops being
 * readable in one screen.
 */
const maxDestinationRecommendations = 12;

const recommendationKeys = ["id", "name", "reason"] as const;

/**
 * Cards stored before places were picked in groups named the province `region` and
 * carried an `imageUrl` for the photo on the card. Both are read as what they were:
 * the region is the province, and the image is gone.
 */
const legacyRecommendationKeys = ["province", "region", "imageUrl"] as const;

const locationCandidateKeys = [
  "providerId", "name", "region", "address", "longitude", "latitude", "coordinateSystem",
] as const;

/**
 * Messages stored before the provider's administrative levels were kept have no
 * such keys, and a Journey saved then still has to open, so an absent level reads
 * as an unknown one rather than as a corrupt message.
 */
const locationCandidateAreaKeys = ["province", "city", "district"] as const;

function validateLocationCandidate(value: unknown): LocationCandidate {
  if (!isRecord(value) || !hasKnownKeys(value, locationCandidateKeys, locationCandidateAreaKeys) ||
    !isPresentText(value.providerId) || !isPresentText(value.name) ||
    !(value.region === null || isPresentText(value.region)) ||
    !(value.address === null || isPresentText(value.address)) ||
    locationCandidateAreaKeys.some((key) =>
      Object.hasOwn(value, key) && !(value[key] === null || isPresentText(value[key]))) ||
    typeof value.longitude !== "number" || !Number.isFinite(value.longitude) || Math.abs(value.longitude) > 180 ||
    typeof value.latitude !== "number" || !Number.isFinite(value.latitude) || Math.abs(value.latitude) > 90 ||
    value.coordinateSystem !== "GCJ-02") {
    throw new InvalidTripMessageError("TripMessage location candidate is invalid.");
  }
  return {
    providerId: value.providerId,
    name: value.name,
    province: storedAreaLevel(value.province),
    city: storedAreaLevel(value.city),
    district: storedAreaLevel(value.district),
    region: value.region as string | null,
    address: value.address as string | null,
    longitude: value.longitude,
    latitude: value.latitude,
    coordinateSystem: "GCJ-02",
  };
}

function storedAreaLevel(value: unknown): string | null {
  return isPresentText(value) ? value : null;
}

function hasKnownKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[],
): boolean {
  return required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => required.includes(key) || optional.includes(key));
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
