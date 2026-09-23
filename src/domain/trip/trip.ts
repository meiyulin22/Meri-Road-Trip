import { InvalidTripInputError } from "./trip-errors";

export const tripStatuses = ["idea", "planning"] as const;

export type TripStatus = (typeof tripStatuses)[number];

export type Trip = {
  readonly id: string;
  readonly status: TripStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type TripCreationInput = {
  status?: TripStatus;
};

export function validateTripCreationInput(input: unknown): TripCreationInput {
  if (!isRecord(input)) {
    throw new InvalidTripInputError(["Input must be a JSON object."]);
  }

  const issues: string[] = [];

  if (input.status !== undefined && !isTripStatus(input.status)) {
    issues.push(`status must be one of: ${tripStatuses.join(", ")}.`);
  }

  if (Object.keys(input).some((key) => key !== "status")) {
    issues.push("Trip creation accepts only lifecycle status.");
  }

  if (issues.length > 0) {
    throw new InvalidTripInputError(issues);
  }

  return {
    ...(input.status !== undefined
      ? { status: input.status as TripStatus }
      : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTripStatus(value: unknown): value is TripStatus {
  return typeof value === "string" && tripStatuses.includes(value as TripStatus);
}
