import {
  transportPreferences,
  type TripDraft,
  type TripDraftField,
  type TransportPreference,
} from "@/domain/trip-draft/trip-draft";

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

export interface TripState {
  readonly name: TripStateField;
  readonly origin: TripStateField;
  readonly destination: TripStateField;
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
    origin: validateStateField(value.origin, "origin"),
    destination: validateStateField(value.destination, "destination"),
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
  return {
    // TripDraft currently cannot distinguish a user-supplied name from one
    // inferred by the model, so the narrow safe default is system-sourced.
    name: initializeField(draft.name, "system"),
    origin: initializeField(draft.origin, "user"),
    destination: initializeField(draft.destination, "user"),
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
  return { ...state, ...patch };
}
