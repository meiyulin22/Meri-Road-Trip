import {
  transportPreferences,
  type TripDraft,
  type TripDraftField,
} from "@/domain/trip-draft/trip-draft";

export type NewTripComposerPhase = "editing" | "submitting" | "review" | "error";

export interface NewTripComposerState {
  readonly message: string;
  readonly phase: NewTripComposerPhase;
  readonly draft: TripDraft | null;
  readonly error: string | null;
}

export type NewTripComposerAction =
  | { readonly type: "message.changed"; readonly message: string }
  | { readonly type: "submission.started" }
  | { readonly type: "submission.succeeded"; readonly draft: TripDraft }
  | { readonly type: "submission.failed"; readonly error: string };

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
  };
}

export function canSubmitTripDraft(state: NewTripComposerState): boolean {
  return state.phase !== "submitting" && state.message.trim() !== "";
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
      return { ...state, phase: "submitting", draft: null, error: null };
    case "submission.succeeded":
      return {
        message: "",
        phase: "review",
        draft: action.draft,
        error: null,
      };
    case "submission.failed":
      return { ...state, phase: "error", draft: null, error: action.error };
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
    body.trip.id.trim() === ""
  ) {
    throw new JourneyCreationRequestError(
      "The Journey creation request was unsuccessful.",
    );
  }

  const tripId = body.trip.id;
  navigate(`/trips/${encodeURIComponent(tripId)}`);
  return tripId;
}
