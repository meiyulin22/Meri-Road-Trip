import type {
  TripDraft,
  TripDraftField,
  TransportPreference,
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
