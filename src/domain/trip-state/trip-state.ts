import {
  transportPreferences,
  type TripDraft,
  type TripDraftField,
  type TransportPreference,
} from "@/domain/trip-draft/trip-draft";
import type { LocationSuggestion } from "@/domain/location/location-suggestion";

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

export interface TripState {
  readonly name: TripStateField;
  readonly origin: LocationField;
  readonly destination: LocationField;
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

function validateLocationSelection(value: unknown, label: "origin" | "destination"): LocationSelection {
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

function validateLocationField(value: unknown, label: "origin" | "destination"): LocationField {
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
    destination: validateLocationField(value.destination, "destination"),
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

  const patch: { -readonly [K in keyof TripState]?: TripState[K] } = {};
  for (const key of keys as TripStateFieldName[]) {
    if (key === "origin" || key === "destination") {
      Object.assign(patch, { [key]: validateLocationField(value[key], key) });
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

export function initializeTripState(draft: TripDraft): TripState {
  const destination = initializeField(draft.destination, "user");
  const name = initializeField(draft.name, "system");
  return {
    // TripDraft currently cannot distinguish a user-supplied name from one
    // inferred by the model, so the narrow safe default is system-sourced.
    name: withDefaultName(name, destination),
    origin: initializeField(draft.origin, "user"),
    destination,
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
    (state.destination.state !== "known" || state.destination.value !== patch.destination.value)) {
    return {
      ...nextState,
      name: { state: "known", value: `${patch.destination.value}之旅`, source: "system" },
    };
  }

  return {
    ...nextState,
    name: withDefaultName(nextState.name, nextState.destination),
  };
}

function withDefaultName(
  name: TripStateField,
  destination: TripStateField,
): TripStateField {
  if (name.state !== "missing" || destination.state !== "known") {
    return name;
  }

  return {
    state: "known",
    value: `${destination.value}之旅`,
    source: "system",
  };
}
