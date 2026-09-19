import {
  transportPreferences,
  type TripDraft,
  type TransportPreference,
} from "@/domain/trip-draft/trip-draft";
import {
  applyTripStatePatch,
  initializeTripState,
  type TripState,
  type TripStateField,
  type TripStateFieldName,
  type TripStatePatch,
} from "@/domain/trip-state/trip-state";

export interface TemporaryTripWorkspaceState {
  readonly tripState: TripState;
  readonly initialMessage: string;
}

let currentWorkspace: TemporaryTripWorkspaceState | null = null;
const listeners = new Set<() => void>();

export type TemporaryTripStateEdit =
  | {
      readonly type: "confirm";
      readonly field: TripStateFieldName;
      readonly value: string;
    }
  | { readonly type: "cancel" };

function emitChange(): void {
  listeners.forEach((listener) => listener());
}

function isTransportPreference(value: string): value is TransportPreference {
  return transportPreferences.some((preference) => preference === value);
}

export function setTemporaryTripWorkspace(
  draft: TripDraft,
  initialMessage: string,
): void {
  currentWorkspace = {
    tripState: initializeTripState(draft),
    initialMessage,
  };
  emitChange();
}

export function getTemporaryTripWorkspace(): TemporaryTripWorkspaceState | null {
  return currentWorkspace;
}

export function clearTemporaryTripWorkspace(): void {
  currentWorkspace = null;
  emitChange();
}

export function subscribeTemporaryTripWorkspace(
  listener: () => void,
): () => void {
  listeners.add(listener);

  return () => listeners.delete(listener);
}

function createUserEditPatch(
  state: TripState,
  field: TripStateFieldName,
  value: string,
): TripStatePatch {
  if (value.trim() === "") {
    return { [field]: { state: "missing" } };
  }

  if (field === "transportPreference") {
    if (!isTransportPreference(value)) {
      throw new Error("Invalid transport preference for temporary TripState.");
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

export function applyTemporaryTripStateEdit(
  edit: TemporaryTripStateEdit,
): void {
  if (edit.type === "cancel" || currentWorkspace === null) {
    return;
  }

  currentWorkspace = {
    ...currentWorkspace,
    tripState: applyTripStatePatch(
      currentWorkspace.tripState,
      createUserEditPatch(
        currentWorkspace.tripState,
        edit.field,
        edit.value,
      ),
    ),
  };
  emitChange();
}
