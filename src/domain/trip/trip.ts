import { InvalidTripInputError } from "./trip-errors";

export const tripStatuses = ["idea", "planning"] as const;

export type TripStatus = (typeof tripStatuses)[number];

export type Trip = {
  readonly id: string;
  readonly name: string;
  readonly origin: string | null;
  readonly destination: string | null;
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly status: TripStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type TripCreationInput = {
  name: string;
  origin: string | null;
  destination: string | null;
  startDate: string | null;
  endDate: string | null;
  status?: TripStatus;
};

export function validateTripCreationInput(input: unknown): TripCreationInput {
  if (!isRecord(input)) {
    throw new InvalidTripInputError(["Input must be a JSON object."]);
  }

  const issues: string[] = [];

  if (!isPresentText(input.name)) {
    issues.push("name must be a non-empty string.");
  }

  if (!isNullablePresentText(input.origin)) {
    issues.push("origin must be a non-empty string or null.");
  }

  if (!isNullablePresentText(input.destination)) {
    issues.push("destination must be a non-empty string or null.");
  }

  if (!isNullableDate(input.startDate)) {
    issues.push("startDate must be a valid date in YYYY-MM-DD format or null.");
  }

  if (!isNullableDate(input.endDate)) {
    issues.push("endDate must be a valid date in YYYY-MM-DD format or null.");
  }

  if (
    isValidDate(input.startDate) &&
    isValidDate(input.endDate) &&
    input.endDate < input.startDate
  ) {
    issues.push("endDate must not be before startDate.");
  }

  if (input.status !== undefined && !isTripStatus(input.status)) {
    issues.push(`status must be one of: ${tripStatuses.join(", ")}.`);
  }

  if (issues.length > 0) {
    throw new InvalidTripInputError(issues);
  }

  return {
    name: input.name as string,
    origin: input.origin as string | null,
    destination: input.destination as string | null,
    startDate: input.startDate as string | null,
    endDate: input.endDate as string | null,
    ...(input.status !== undefined
      ? { status: input.status as TripStatus }
      : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPresentText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNullablePresentText(value: unknown): value is string | null {
  return value === null || isPresentText(value);
}

function isNullableDate(value: unknown): value is string | null {
  return value === null || isValidDate(value);
}

function isTripStatus(value: unknown): value is TripStatus {
  return typeof value === "string" && tripStatuses.includes(value as TripStatus);
}

function isValidDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
