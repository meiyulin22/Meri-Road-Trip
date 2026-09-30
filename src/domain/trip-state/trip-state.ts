import {
  transportPreferences,
  type TripDraft,
  type TripDraftField,
  type TransportPreference,
} from "@/domain/trip-draft/trip-draft";
import type { LocationSuggestion } from "@/domain/location/location-suggestion";
import {
  destinationAreasText,
  destinationAreasTitle,
  parseDestinationAreas,
  type DestinationArea,
} from "./destination-areas";

export type TripFieldSource = "user" | "system";

export type TripStateField<T extends string = string> =
  | {
      readonly state: "known";
      readonly value: T;
      readonly source: TripFieldSource;
    }
  | {
      readonly state: "approximate";
      readonly value: string;
      readonly source: TripFieldSource;
    }
  | {
      readonly state: "ambiguous";
      readonly value: string;
      readonly source: TripFieldSource;
    }
  | { readonly state: "missing" };

export interface LocationSelection {
  readonly provider: LocationSuggestion["provider"];
  readonly providerId?: string | null;
  readonly region?: string | null;
  readonly address?: string | null;
  readonly coordinates?: LocationSuggestion["coordinates"];
}

export type LocationField =
  | {
      readonly state: "known";
      readonly value: string;
      readonly source: TripFieldSource;
      readonly selection?: LocationSelection;
    }
  | { readonly state: "approximate" | "ambiguous"; readonly value: string; readonly source: TripFieldSource }
  | { readonly state: "missing" };

/**
 * The destination is the one location that can name several places at once, so it
 * is nothing but its structure: provinces, the 市 inside them, and the spots inside
 * those. There is no free-text value beside it to drift out of step, and no
 * approximate or ambiguous form — a destination is either not chosen yet, or it is a
 * set of real places a provider has confirmed. Its text is derived when needed.
 */
export type DestinationField =
  | { readonly state: "missing" }
  | {
      readonly state: "known";
      readonly source: TripFieldSource;
      readonly areas: readonly DestinationArea[];
      /** Unverified text from an older Journey; retained until the traveler revisits it. */
      readonly legacyText?: string;
    };

/** The destination written out, or null when there is none. */
export function destinationText(destination: DestinationField): string | null {
  if (destination.state === "missing") return null;
  return [destination.legacyText, destination.areas.length ? destinationAreasText(destination.areas) : null]
    .filter(Boolean).join(" · ");
}

/**
 * Recommendations answer 「去哪」, so they are offered while that question is open: no
 * destination at all, or provinces nobody has chosen a place inside yet. Once a place
 * is settled the question has an answer, and offering a list against it would be
 * arguing with the user instead of helping them.
 */
export function isDestinationOpenToRecommendations(destination: DestinationField): boolean {
  if (destination.state === "missing") return true;
  if (destination.legacyText) return false;
  return destination.areas.every((area) => area.places.length === 0);
}

export interface TripState {
  readonly name: TripStateField;
  readonly origin: LocationField;
  readonly destination: DestinationField;
  readonly startDate: TripStateField;
  readonly endDate: TripStateField;
  readonly duration: TripStateField;
  readonly transportPreference: TripStateField<TransportPreference>;
}

export type TripStateFieldName = keyof TripState;
export type TripStatePatch = Readonly<Partial<TripState>>;

export class InvalidTripStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidTripStateError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
): boolean {
  const keys = Object.keys(value);
  return (
    keys.length === expectedKeys.length &&
    expectedKeys.every((key) => Object.hasOwn(value, key))
  );
}

function validateStateField<T extends string = string>(
  value: unknown,
  label: string,
  validateKnownValue?: (fieldValue: string) => boolean,
): TripStateField<T> {
  if (!isRecord(value) || typeof value.state !== "string") {
    throw new InvalidTripStateError(`${label} must be a TripState field.`);
  }

  if (value.state === "missing") {
    if (!hasExactKeys(value, ["state"])) {
      throw new InvalidTripStateError(`${label} missing shape is invalid.`);
    }

    return { state: "missing" };
  }

  if (
    value.state !== "known" &&
    value.state !== "approximate" &&
    value.state !== "ambiguous"
  ) {
    throw new InvalidTripStateError(`${label}.state is invalid.`);
  }

  if (
    !hasExactKeys(value, ["state", "value", "source"]) ||
    typeof value.value !== "string" ||
    value.value.trim() === "" ||
    (value.source !== "user" && value.source !== "system")
  ) {
    throw new InvalidTripStateError(`${label} value or source is invalid.`);
  }

  if (
    value.state === "known" &&
    validateKnownValue &&
    !validateKnownValue(value.value)
  ) {
    throw new InvalidTripStateError(`${label}.value is invalid.`);
  }

  return value as TripStateField<T>;
}

function validateLocationSelection(value: unknown, label: "origin"): LocationSelection {
  if (!isRecord(value) || value.provider !== "amap") {
    throw new InvalidTripStateError(`${label}.selection.provider is invalid.`);
  }

  const allowedKeys = ["provider", "providerId", "region", "address", "coordinates"];
  if (Object.keys(value).some((key) => !allowedKeys.includes(key))) {
    throw new InvalidTripStateError(`${label}.selection has invalid fields.`);
  }

  for (const key of ["providerId", "region", "address"] as const) {
    if (Object.hasOwn(value, key) && value[key] !== null &&
      (typeof value[key] !== "string" || value[key].trim() === "")) {
      throw new InvalidTripStateError(`${label}.selection.${key} is invalid.`);
    }
  }

  if (Object.hasOwn(value, "coordinates") && value.coordinates !== null) {
    const coordinates = value.coordinates;
    if (!isRecord(coordinates) ||
      !hasExactKeys(coordinates, ["longitude", "latitude", "coordinateSystem"]) ||
      typeof coordinates.longitude !== "number" ||
      !Number.isFinite(coordinates.longitude) ||
      coordinates.longitude < -180 || coordinates.longitude > 180 ||
      typeof coordinates.latitude !== "number" ||
      !Number.isFinite(coordinates.latitude) ||
      coordinates.latitude < -90 || coordinates.latitude > 90 ||
      coordinates.coordinateSystem !== "GCJ-02") {
      throw new InvalidTripStateError(`${label}.selection.coordinates are invalid.`);
    }
  }

  return value as unknown as LocationSelection;
}

function validateLocationField(value: unknown, label: "origin"): LocationField {
  if (!isRecord(value) || !Object.hasOwn(value, "selection")) {
    return validateStateField(value, label);
  }

  if (value.state !== "known" || value.source !== "user" ||
    !hasExactKeys(value, ["state", "value", "source", "selection"])) {
    throw new InvalidTripStateError(`${label} selection requires a known user location.`);
  }

  const base = validateStateField({ state: value.state, value: value.value, source: value.source }, label);
  if (base.state !== "known") {
    throw new InvalidTripStateError(`${label} selection requires a known location.`);
  }
  return { ...base, selection: validateLocationSelection(value.selection, label) };
}

function validateDestinationField(value: unknown): DestinationField {
  if (!isRecord(value) || typeof value.state !== "string") {
    throw new InvalidTripStateError("destination must be a TripState field.");
  }
  if (value.state === "missing") {
    if (!hasExactKeys(value, ["state"])) {
      throw new InvalidTripStateError("destination missing shape is invalid.");
    }
    return { state: "missing" };
  }
  if (value.state !== "known" && value.state !== "approximate" && value.state !== "ambiguous") {
    throw new InvalidTripStateError("destination shape is invalid.");
  }
  if ((value.source !== "user" && value.source !== "system") ||
    (value.state !== "known" && typeof value.value !== "string")) {
    throw new InvalidTripStateError("destination shape is invalid.");
  }
  // Older Journeys stored a free-text value and sometimes string places. Those
  // strings may be attractions rather than cities, so retain them for review.
  if (typeof value.value === "string" && value.value.trim() !== "") {
    return { state: "known", source: value.source, areas: [], legacyText: value.value };
  }
  if (value.state !== "known" ||
    !(hasExactKeys(value, ["state", "source", "areas"]) ||
      hasExactKeys(value, ["state", "source", "areas", "legacyText"]))) {
    throw new InvalidTripStateError("destination shape is invalid.");
  }
  const legacyText = value.legacyText;
  if (legacyText !== undefined && (typeof legacyText !== "string" || legacyText.trim() === "")) {
    throw new InvalidTripStateError("destination.legacyText is invalid.");
  }
  const areas = Array.isArray(value.areas) && value.areas.length === 0 && legacyText
    ? [] : parseDestinationAreas(value.areas);
  if (areas === null) {
    throw new InvalidTripStateError("destination.areas is invalid.");
  }
  return { state: "known", source: value.source, areas,
    ...(legacyText === undefined ? {} : { legacyText }) };
}

export function validateTripState(value: unknown): TripState {
  const fieldNames: TripStateFieldName[] = [
    "name",
    "origin",
    "destination",
    "startDate",
    "endDate",
    "duration",
    "transportPreference",
  ];

  if (!isRecord(value) || !hasExactKeys(value, fieldNames)) {
    throw new InvalidTripStateError("TripState has an invalid shape.");
  }

  return {
    name: validateStateField(value.name, "name"),
    origin: validateLocationField(value.origin, "origin"),
    destination: validateDestinationField(value.destination),
    startDate: validateStateField(value.startDate, "startDate"),
    endDate: validateStateField(value.endDate, "endDate"),
    duration: validateStateField(value.duration, "duration"),
    transportPreference: validateStateField(
      value.transportPreference,
      "transportPreference",
      (fieldValue) =>
        transportPreferences.some((preference) => preference === fieldValue),
    ),
  };
}

export function validateTripStatePatch(value: unknown): TripStatePatch {
  const fieldNames: TripStateFieldName[] = [
    "name",
    "origin",
    "destination",
    "startDate",
    "endDate",
    "duration",
    "transportPreference",
  ];

  if (!isRecord(value)) {
    throw new InvalidTripStateError("TripStatePatch must be an object.");
  }

  const keys = Object.keys(value);
  if (
    keys.length === 0 ||
    keys.some((key) => !fieldNames.includes(key as TripStateFieldName))
  ) {
    throw new InvalidTripStateError("TripStatePatch has invalid fields.");
  }
  // A destination only changes through a destination edit, where every place is
  // confirmed by the provider. A plain patch would let a client write any text in.
  if (keys.includes("destination")) {
    throw new InvalidTripStateError("destination cannot be patched directly.");
  }

  const patch: { -readonly [K in keyof TripState]?: TripState[K] } = {};
  for (const key of keys as TripStateFieldName[]) {
    if (key === "origin") {
      Object.assign(patch, { origin: validateLocationField(value.origin, "origin") });
      continue;
    }
    const field = validateStateField(
      value[key],
      key,
      key === "transportPreference"
        ? (fieldValue) =>
            transportPreferences.some((preference) => preference === fieldValue)
        : undefined,
    );
    Object.assign(patch, { [key]: field });
  }

  return patch;
}

function initializeField<T extends string>(
  field: TripDraftField<T>,
  source: TripFieldSource,
): TripStateField<T> {
  if (field.state === "missing") {
    return { state: "missing" };
  }

  return { ...field, source };
}

/**
 * The destination starts missing: the first message names it in words, and it only
 * becomes places once the destination edit has confirmed them with the provider.
 */
export function initializeTripState(draft: TripDraft): TripState {
  return {
    // TripDraft currently cannot distinguish a user-supplied name from one
    // inferred by the model, so the narrow safe default is system-sourced.
    name: initializeField(draft.name, "system"),
    origin: initializeField(draft.origin, "user"),
    destination: { state: "missing" },
    startDate: initializeField(draft.startDate, "user"),
    endDate: initializeField(draft.endDate, "user"),
    duration: initializeField(draft.duration, "user"),
    transportPreference: initializeField(
      draft.transportPreference,
      "user",
    ),
  };
}

export function applyTripStatePatch(
  state: TripState,
  patch: TripStatePatch,
): TripState {
  const nextState = { ...state, ...patch };
  if (Object.hasOwn(patch, "name")) {
    return nextState;
  }

  if (patch.destination?.state === "known" &&
    state.name.state !== "missing" && state.name.source === "system" &&
    destinationText(state.destination) !== destinationText(patch.destination)) {
    return {
      ...nextState,
      name: { state: "known", value: `${destinationTitle(patch.destination)}之旅`, source: "system" },
    };
  }

  return {
    ...nextState,
    name: withDefaultName(nextState.name, nextState.destination),
  };
}

function withDefaultName(
  name: TripStateField,
  destination: DestinationField,
): TripStateField {
  if (name.state !== "missing" || destination.state !== "known") {
    return name;
  }

  return {
    state: "known",
    value: `${destinationTitle(destination)}之旅`,
    source: "system",
  };
}

/**
 * A destination spanning several provinces would make an unreadable title if every
 * place went into it, so the structure names the trip.
 */
function destinationTitle(destination: DestinationField): string {
  return destination.state === "missing" ? "" : destination.areas.length
    ? destinationAreasTitle(destination.areas) : destination.legacyText ?? "";
}
