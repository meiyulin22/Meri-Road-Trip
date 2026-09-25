import {
  transportPreferences,
  type TripDraft,
  type TripDraftField,
} from "@/domain/trip-draft/trip-draft";
import { validateTripMessage } from "@/domain/trip-message/trip-message";

export type NewTripComposerPhase = "editing" | "submitting" | "review" | "error" | "opening_failed" | "retrying_opening";

export interface NewTripComposerState {
  readonly message: string;
  readonly phase: NewTripComposerPhase;
  readonly draft: TripDraft | null;
  readonly error: string | null;
  readonly createdTripId: string | null;
}

export type NewTripComposerAction =
  | { readonly type: "message.changed"; readonly message: string }
  | { readonly type: "submission.started" }
  | { readonly type: "submission.succeeded"; readonly draft: TripDraft }
  | { readonly type: "submission.failed"; readonly error: string }
  | { readonly type: "opening.failed"; readonly tripId: string; readonly draft: TripDraft }
  | { readonly type: "opening.retry.started" }
  | { readonly type: "opening.retry.failed"; readonly error: string };

export class TripDraftRequestError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "TripDraftRequestError";
  }
}

export class JourneyCreationRequestError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "JourneyCreationRequestError";
  }
}

export function createInitialComposerState(): NewTripComposerState {
  return {
    message: "",
    phase: "editing",
    draft: null,
    error: null,
    createdTripId: null,
  };
}

export function canSubmitTripDraft(state: NewTripComposerState): boolean {
  return (state.phase === "editing" || state.phase === "error") && state.message.trim() !== "";
}

export function newTripComposerReducer(
  state: NewTripComposerState,
  action: NewTripComposerAction,
): NewTripComposerState {
  switch (action.type) {
    case "message.changed":
      return {
        ...state,
        message: action.message,
        phase: state.phase === "error" ? "editing" : state.phase,
        error: null,
      };
    case "submission.started":
      return { ...state, phase: "submitting", draft: null, error: null, createdTripId: null };
    case "submission.succeeded":
      return {
        message: "",
        phase: "review",
        draft: action.draft,
        error: null,
        createdTripId: null,
      };
    case "submission.failed":
      return { ...state, phase: "error", draft: null, error: action.error, createdTripId: null };
    case "opening.failed":
      return { ...state, phase: "opening_failed", draft: action.draft, createdTripId: action.tripId, error: null };
    case "opening.retry.started":
      return { ...state, phase: "retrying_opening", error: null };
    case "opening.retry.failed":
      return { ...state, phase: "opening_failed", error: action.error };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actualKeys = Object.keys(value);
  return (
    actualKeys.length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

function isTripDraftField(
  value: unknown,
  validateKnownValue: (knownValue: string) => boolean = () => true,
): value is TripDraftField {
  if (!isRecord(value) || typeof value.state !== "string") {
    return false;
  }

  if (value.state === "known") {
    return (
      hasExactKeys(value, ["state", "value"]) &&
      typeof value.value === "string" &&
      value.value.trim() !== "" &&
      validateKnownValue(value.value)
    );
  }

  if (value.state === "missing") {
    return hasExactKeys(value, ["state"]);
  }

  return (
    (value.state === "approximate" || value.state === "ambiguous") &&
    hasExactKeys(value, ["state", "value"]) &&
    typeof value.value === "string" &&
    value.value.trim() !== ""
  );
}

function isTripDraft(value: unknown): value is TripDraft {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "name",
      "origin",
      "destination",
      "startDate",
      "endDate",
      "duration",
      "transportPreference",
    ])
  ) {
    return false;
  }

  return (
    isTripDraftField(value.name) &&
    isTripDraftField(value.origin) &&
    isTripDraftField(value.destination) &&
    isTripDraftField(value.startDate) &&
    isTripDraftField(value.endDate) &&
    isTripDraftField(value.duration) &&
    isTripDraftField(value.transportPreference, (knownValue) =>
      transportPreferences.some((preference) => preference === knownValue),
    )
  );
}

export async function requestTripDraft(
  message: string,
  fetcher: typeof fetch = fetch,
): Promise<TripDraft> {
  const normalizedMessage = message.trim();

  if (normalizedMessage === "") {
    throw new TripDraftRequestError("A trip idea is required.");
  }

  let response: Response;

  try {
    response = await fetcher("/api/trip-drafts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: normalizedMessage }),
    });
  } catch (error) {
    throw new TripDraftRequestError("The TripDraft request failed.", error);
  }

  let body: unknown;

  try {
    body = await response.json();
  } catch (error) {
    throw new TripDraftRequestError("The TripDraft response was not JSON.", error);
  }

  if (
    !response.ok ||
    !isRecord(body) ||
    !("draft" in body) ||
    !isTripDraft(body.draft)
  ) {
    throw new TripDraftRequestError("The TripDraft request was unsuccessful.");
  }

  return body.draft;
}

export async function createJourneyAndNavigate(
  draft: TripDraft,
  initialUserMessage: string,
  navigate: (path: string) => void,
  onOpeningFailure: (tripId: string) => void,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  let response: Response;

  try {
    response = await fetcher("/api/journeys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draft, initialUserMessage }),
    });
  } catch (error) {
    throw new JourneyCreationRequestError(
      "The Journey creation request failed.",
      error,
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    throw new JourneyCreationRequestError(
      "The Journey creation response was not JSON.",
      error,
    );
  }

  if (
    !response.ok ||
    !isRecord(body) ||
    !isRecord(body.trip) ||
    typeof body.trip.id !== "string" ||
    body.trip.id.trim() === "" ||
    (body.opening !== "completed" && body.opening !== "failed")
  ) {
    throw new JourneyCreationRequestError(
      "The Journey creation request was unsuccessful.",
    );
  }

  const tripId = body.trip.id;
  if (body.opening === "failed") {
    onOpeningFailure(tripId);
    return tripId;
  }
  navigate(`/trips/${encodeURIComponent(tripId)}`);
  return tripId;
}

export async function retryOpeningAndNavigate(
  tripId: string,
  navigate: (path: string) => void,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const response = await fetcher(`/api/trips/${encodeURIComponent(tripId)}/conversation/initialize`, {
    method: "POST",
  });
  if (!response.ok) {
    throw new JourneyCreationRequestError("The opening response could not be completed.");
  }
  const body: unknown = await response.json();
  if (typeof body !== "object" || body === null || !("message" in body)) {
    throw new JourneyCreationRequestError("The opening response was invalid.");
  }
  let message;
  try {
    message = validateTripMessage(body.message);
  } catch (error) {
    throw new JourneyCreationRequestError("The opening response was invalid.", error);
  }
  if (message.tripId !== tripId || message.role !== "assistant") {
    throw new JourneyCreationRequestError("The opening response was invalid.");
  }
  navigate(`/trips/${encodeURIComponent(tripId)}`);
}
