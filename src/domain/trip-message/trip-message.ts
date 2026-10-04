import type { LocationCandidate } from "@/domain/location/location";
import { parsePlaceImage, type PlaceImage } from "@/domain/location/place-image";

export const tripMessageRoles = ["user", "assistant"] as const;

export type TripMessageRole = (typeof tripMessageRoles)[number];

/**
 * One place a user can pick: a 市, the province it belongs to, and — when the user
 * named a spot inside it — that spot, so picking the 市 keeps what they asked for.
 *
 * A reason is what a recommendation adds to a place. Narrowing 「潮汕」 carries none:
 * 潮汕 containing 潮州市 is the whole answer, and a sentence about why 潮州市 is worth
 * going to would be invented rather than looked up.
 */
export interface DestinationChoice {
  readonly id: string;
  readonly name: string;
  readonly province: string;
  readonly city?: string;
  readonly spot?: string;
  readonly reason?: string;
  readonly detail?: string;
  readonly legacyUnverified?: boolean;
  readonly image?: PlaceImage;
}

/**
 * Places offered to pick several of at once: Meri's recommendations, the 市 a broad
 * region such as 潮汕 covers, or the places an ambiguous name could mean. `add` keeps
 * what is already chosen; `replace` answers 「改去潮汕吧」, where the user asked for the
 * destination to become what they pick.
 */
export interface DestinationChoicesPresentation {
  readonly type: "destination_choices";
  readonly mode: "add" | "replace";
  readonly choices: readonly DestinationChoice[];
  readonly baseDestination?: string;
}

/**
 * One recommended place. Its photo is looked up after the card is shown, so `image`
 * has three states: absent while no one has looked yet, a photo once one was found,
 * and null once the lookup found nothing to show. `landmark` is what the photo
 * should show (丽江市 → 玉龙雪山); it only picks the photo.
 */
export interface DestinationRecommendation {
  readonly id: string;
  readonly name: string;
  readonly province: string | null;
  readonly reason?: string;
  readonly landmark?: string;
  readonly image?: PlaceImage | null;
}

/** Historical offers remain readable while Journeys move to the new choice UI. */
export interface DestinationRecommendationPresentation {
  readonly type: "destination_recommendations";
  readonly destinations: readonly DestinationRecommendation[];
  readonly baseAreas?: readonly { readonly province: string; readonly places: readonly string[] }[];
}

/**
 * The cards whose photo no one has looked up yet. A card without a province is a
 * record from before provinces were stored; it has nowhere to look inside.
 */
export function recommendationsAwaitingPhoto(
  presentation: DestinationRecommendationPresentation,
): readonly (DestinationRecommendation & { readonly province: string })[] {
  return presentation.destinations.filter((item): item is DestinationRecommendation & { readonly province: string } =>
    item.image === undefined && item.province !== null);
}

/**
 * Which places recommendation cards may come from: inside the provinces already
 * saved while 「去哪」 is still open, or outside them when the user asks to widen a
 * trip that already has its places.
 */
export type RecommendationScope = "within" | "elsewhere";

/**
 * A reply whose recommendation cards are still being chosen. The reply is shown as
 * soon as the model has written it; the cards follow as their own message, so the
 * user is not left waiting on a search and a second model call to read anything.
 */
export interface DestinationRecommendationsPendingPresentation {
  readonly type: "destination_recommendations_pending";
  readonly scope: RecommendationScope;
}

export interface LocationCandidatesPresentation {
  readonly type: "location_candidates";
  readonly candidates: readonly LocationCandidate[];
}

export type TripMessagePresentation = DestinationChoicesPresentation |
  DestinationRecommendationPresentation | LocationCandidatesPresentation |
  DestinationRecommendationsPendingPresentation;

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
  if (role !== "assistant" || !isRecord(value)) {
    throw new InvalidTripMessageError("TripMessage.presentation is invalid.");
  }
  if (value.type === "destination_recommendations") {
    if (!hasKnownKeys(value, ["type", "destinations"], ["baseAreas"]) ||
      !Array.isArray(value.destinations) || value.destinations.length < 1 ||
      value.destinations.length > maxDestinationChoices) {
      throw new InvalidTripMessageError("TripMessage.presentation is invalid.");
    }
    const destinations = value.destinations.map((item: unknown) => {
      if (!isRecord(item) || !hasKnownKeys(item, ["id", "name"], ["province", "region", "reason", "landmark", "imageUrl", "image"]) ||
        !isPresentText(item.id) || !isPresentText(item.name) ||
        !(item.province === undefined || item.province === null || isPresentText(item.province)) ||
        !(item.region === undefined || item.region === null || isPresentText(item.region)) ||
        !(item.reason === undefined || isPresentText(item.reason)) ||
        !(item.landmark === undefined || (isPresentText(item.landmark) && item.landmark.length <= 30))) {
        throw new InvalidTripMessageError("TripMessage.presentation destination is invalid.");
      }
      // A stored image that no longer validates counts as no photo rather than losing
      // the card, and is not looked up again on every load.
      const image = item.image === undefined ? undefined : parsePlaceImage(item.image);
      return { id: item.id as string, name: item.name as string,
        province: (item.province ?? item.region ?? null) as string | null,
        ...(item.reason === undefined ? {} : { reason: item.reason as string }),
        ...(item.landmark === undefined ? {} : { landmark: item.landmark as string }),
        ...(image === undefined ? {} : { image }) };
    });
    if (new Set(destinations.map((item) => item.id)).size !== destinations.length) {
      throw new InvalidTripMessageError("TripMessage.presentation IDs must be distinct.");
    }
    const baseAreas = value.baseAreas;
    if (baseAreas !== undefined && (!Array.isArray(baseAreas) || baseAreas.length === 0 ||
      baseAreas.some((area) => !isRecord(area) || !isPresentText(area.province) ||
        !Array.isArray(area.places) || !area.places.every(isPresentText) ||
        new Set(area.places).size !== area.places.length))) {
      throw new InvalidTripMessageError("TripMessage.presentation base areas are invalid.");
    }
    return { type: "destination_recommendations", destinations,
      ...(baseAreas === undefined ? {} : { baseAreas: baseAreas as DestinationRecommendationPresentation["baseAreas"] }) };
  }
  if (value.type === "destination_recommendations_pending") {
    if (!hasKnownKeys(value, ["type", "scope"], []) || (value.scope !== "within" && value.scope !== "elsewhere")) {
      throw new InvalidTripMessageError("TripMessage pending recommendation is invalid.");
    }
    return { type: "destination_recommendations_pending", scope: value.scope };
  }
  if (value.type === "location_candidates") {
    if (!hasKnownKeys(value, ["type", "candidates"], []) || !Array.isArray(value.candidates) ||
      value.candidates.length === 0) {
      throw new InvalidTripMessageError("TripMessage location candidates are invalid.");
    }
    const candidates = value.candidates.map(validateLocationCandidate);
    const identities = candidates.map((candidate) => `${candidate.providerId}:${candidate.longitude},${candidate.latitude}`);
    if (new Set(identities).size !== identities.length) {
      throw new InvalidTripMessageError("TripMessage location candidates must be distinct.");
    }
    return { type: "location_candidates", candidates };
  }
  if (!hasKnownKeys(value, ["type", "mode", "choices"], ["baseDestination"]) ||
    value.type !== "destination_choices" || (value.mode !== "add" && value.mode !== "replace") ||
    !(value.baseDestination === undefined || typeof value.baseDestination === "string") ||
    !Array.isArray(value.choices) || value.choices.length < 1 || value.choices.length > maxDestinationChoices) {
    throw new InvalidTripMessageError("TripMessage.presentation is invalid.");
  }
  const choices = value.choices.map((item: unknown): DestinationChoice => {
    if (!isRecord(item) || !hasKnownKeys(item, ["id", "name", "province"], ["city", "spot", "reason", "detail", "legacyUnverified", "image"]) ||
      !isPresentText(item.id) || !isPresentText(item.name) || !isPresentText(item.province) ||
      !(item.city === undefined || isPresentText(item.city)) ||
      !(item.spot === undefined || isPresentText(item.spot)) ||
      !(item.detail === undefined || isPresentText(item.detail)) ||
      !(item.reason === undefined || isPresentText(item.reason))) {
      throw new InvalidTripMessageError("TripMessage.presentation choice is invalid.");
    }
    const image = parsePlaceImage(item.image);
    return { id: item.id, name: item.name, province: item.province,
      ...(item.city === undefined ? {} : { city: item.city }),
      ...(item.spot === undefined ? {} : { spot: item.spot }),
      ...(item.detail === undefined ? {} : { detail: item.detail }),
      ...(item.reason === undefined ? {} : { reason: item.reason }),
      ...(image ? { image } : {}) };
  });
  if (new Set(choices.map((item) => item.id)).size !== choices.length) {
    throw new InvalidTripMessageError("TripMessage.presentation IDs must be distinct.");
  }
  return { type: "destination_choices", mode: value.mode, choices,
    ...(value.baseDestination === undefined ? {} : { baseDestination: value.baseDestination }) };
}

/**
 * Picking several places at once is what makes a regional trip expressible. Twelve
 * is where a grouped list stops being readable in one screen.
 */
export const maxDestinationChoices = 12;

function validateLocationCandidate(value: unknown): LocationCandidate {
  const required = ["providerId", "name", "region", "address", "longitude", "latitude", "coordinateSystem"];
  const levels = ["province", "city", "district"];
  if (!isRecord(value) || !hasKnownKeys(value, required, [...levels, "kind"]) ||
    !isPresentText(value.providerId) || !isPresentText(value.name) ||
    !(value.region === null || isPresentText(value.region)) ||
    !(value.address === null || isPresentText(value.address)) ||
    levels.some((key) => Object.hasOwn(value, key) && !(value[key] === null || isPresentText(value[key]))) ||
    typeof value.longitude !== "number" || !Number.isFinite(value.longitude) || Math.abs(value.longitude) > 180 ||
    typeof value.latitude !== "number" || !Number.isFinite(value.latitude) || Math.abs(value.latitude) > 90 ||
    value.coordinateSystem !== "GCJ-02") {
    throw new InvalidTripMessageError("TripMessage location candidate is invalid.");
  }
  return { providerId: value.providerId, name: value.name,
    province: isPresentText(value.province) ? value.province : null,
    city: isPresentText(value.city) ? value.city : null,
    district: isPresentText(value.district) ? value.district : null,
    region: value.region as string | null, address: value.address as string | null,
    longitude: value.longitude, latitude: value.latitude, coordinateSystem: "GCJ-02",
    ...(value.kind === "sight" || value.kind === "other" ? { kind: value.kind } : {}) };
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
