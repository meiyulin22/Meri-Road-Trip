export const transportPreferences = [
  "self_drive",
  "no_self_drive",
  "public_transport",
  "flexible",
] as const;

export type TransportPreference = (typeof transportPreferences)[number];

export type TripDraftField<T extends string = string> =
  | { readonly state: "known"; readonly value: T }
  | { readonly state: "missing" }
  | { readonly state: "ambiguous"; readonly description: string };

export interface TripDraft {
  readonly name: TripDraftField;
  readonly destination: TripDraftField;
  readonly startDate: TripDraftField;
  readonly endDate: TripDraftField;
  readonly transportPreference: TripDraftField<TransportPreference>;
}

export class InvalidTripDraftError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidTripDraftError";
  }
}

type ModelField = {
  state: "known" | "missing" | "ambiguous";
  value: string | null;
  note: string | null;
};

const tripDraftKeys = [
  "name",
  "destination",
  "startDate",
  "endDate",
  "transportPreference",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
  label: string,
): void {
  const actualKeys = Object.keys(value);

  if (
    actualKeys.length !== expectedKeys.length ||
    expectedKeys.some((key) => !Object.hasOwn(value, key))
  ) {
    throw new InvalidTripDraftError(`${label} has an invalid shape.`);
  }
}

function parseModelField(value: unknown, label: string): ModelField {
  if (!isRecord(value)) {
    throw new InvalidTripDraftError(`${label} must be an object.`);
  }

  assertExactKeys(value, ["state", "value", "note"], label);

  const { state, value: fieldValue, note } = value;

  if (state !== "known" && state !== "missing" && state !== "ambiguous") {
    throw new InvalidTripDraftError(`${label}.state is invalid.`);
  }

  if (fieldValue !== null && typeof fieldValue !== "string") {
    throw new InvalidTripDraftError(`${label}.value must be a string or null.`);
  }

  if (note !== null && typeof note !== "string") {
    throw new InvalidTripDraftError(`${label}.note must be a string or null.`);
  }

  return { state, value: fieldValue, note };
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function toTripDraftField<T extends string = string>(
  value: unknown,
  label: string,
  validateKnownValue?: (knownValue: string) => boolean,
): TripDraftField<T> {
  const field = parseModelField(value, label);

  if (field.state === "known") {
    if (field.value === null || field.value.trim() === "" || field.note !== null) {
      throw new InvalidTripDraftError(
        `${label} must contain a non-empty value and a null note when known.`,
      );
    }

    if (validateKnownValue && !validateKnownValue(field.value)) {
      throw new InvalidTripDraftError(`${label}.value is invalid.`);
    }

    return { state: "known", value: field.value as T };
  }

  if (field.state === "missing") {
    if (field.value !== null || field.note !== null) {
      throw new InvalidTripDraftError(
        `${label} must contain null value and note when missing.`,
      );
    }

    return { state: "missing" };
  }

  if (field.value !== null || field.note === null || field.note.trim() === "") {
    throw new InvalidTripDraftError(
      `${label} must contain a null value and non-empty note when ambiguous.`,
    );
  }

  return { state: "ambiguous", description: field.note };
}

function isTransportPreference(value: string): value is TransportPreference {
  return transportPreferences.some((preference) => preference === value);
}

export function validateTripDraft(value: unknown): TripDraft {
  if (!isRecord(value)) {
    throw new InvalidTripDraftError("TripDraft must be an object.");
  }

  assertExactKeys(value, tripDraftKeys, "TripDraft");

  const draft: TripDraft = {
    name: toTripDraftField(value.name, "name"),
    destination: toTripDraftField(value.destination, "destination"),
    startDate: toTripDraftField(value.startDate, "startDate", isIsoDate),
    endDate: toTripDraftField(value.endDate, "endDate", isIsoDate),
    transportPreference: toTripDraftField(
      value.transportPreference,
      "transportPreference",
      isTransportPreference,
    ),
  };

  if (
    draft.startDate.state === "known" &&
    draft.endDate.state === "known" &&
    draft.endDate.value < draft.startDate.value
  ) {
    throw new InvalidTripDraftError("endDate cannot be before startDate.");
  }

  return draft;
}
