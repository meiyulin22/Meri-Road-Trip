import {
  transportPreferences,
  type TransportPreference,
} from "@/domain/trip-draft/trip-draft";
import {
  validateTripState,
  type TripState,
  type TripStateField,
  type TripStateFieldName,
  type TripStatePatch,
} from "@/domain/trip-state/trip-state";

type Fetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export class TripStatePersistenceRequestError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "TripStatePersistenceRequestError";
  }
}

export function createDirectTripStatePatch(
  state: TripState,
  field: TripStateFieldName,
  value: string,
): TripStatePatch {
  if (value.trim() === "") {
    return { [field]: { state: "missing" } };
  }

  if (field === "transportPreference") {
    if (!isTransportPreference(value)) {
      throw new TripStatePersistenceRequestError(
        "Invalid transport preference.",
      );
    }

    return {
      transportPreference: { state: "known", value, source: "user" },
    };
  }

  const currentField = state[field];
  const nextField: TripStateField = {
    state: currentField.state === "missing" ? "known" : currentField.state,
    value,
    source: "user",
  };

  return { [field]: nextField };
}

export async function requestTripStateUpdate(
  tripId: string,
  patch: TripStatePatch,
  fetcher: Fetcher = fetch,
): Promise<TripState> {
  let response: Response;
  try {
    response = await fetcher(
      `/api/trips/${encodeURIComponent(tripId)}/state`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patch }),
      },
    );
  } catch (error) {
    throw new TripStatePersistenceRequestError(
      "The TripState update request failed.",
      error,
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    throw new TripStatePersistenceRequestError(
      "The TripState update response was not JSON.",
      error,
    );
  }

  if (
    !response.ok ||
    typeof body !== "object" ||
    body === null ||
    !("tripState" in body)
  ) {
    throw new TripStatePersistenceRequestError(
      "The TripState update request was unsuccessful.",
    );
  }

  try {
    return validateTripState(body.tripState);
  } catch (error) {
    throw new TripStatePersistenceRequestError(
      "The TripState update response was invalid.",
      error,
    );
  }
}

function isTransportPreference(value: string): value is TransportPreference {
  return transportPreferences.some((preference) => preference === value);
}
