import {
  transportPreferences,
  type TripDraft,
  type TransportPreference,
} from "@/domain/trip-draft/trip-draft";

export interface TemporaryTripWorkspaceState {
  readonly draft: TripDraft;
  readonly initialMessage: string;
}

let currentWorkspace: TemporaryTripWorkspaceState | null = null;
const listeners = new Set<() => void>();

export type TripDraftFieldName = keyof TripDraft;

export type TemporaryTripDraftEdit =
  | {
      readonly type: "confirm";
      readonly field: TripDraftFieldName;
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
  currentWorkspace = { draft, initialMessage };
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

export function applyTemporaryTripDraftEdit(
  edit: TemporaryTripDraftEdit,
): void {
  if (edit.type === "cancel" || currentWorkspace === null) {
    return;
  }

  const nextField =
    edit.value.trim() === ""
      ? ({ state: "missing" } as const)
      : ({ state: "known", value: edit.value } as const);

  if (
    edit.field === "transportPreference" &&
    nextField.state === "known" &&
    !isTransportPreference(nextField.value)
  ) {
    throw new Error("Invalid transport preference for temporary TripDraft.");
  }

  currentWorkspace = {
    ...currentWorkspace,
    draft: {
      ...currentWorkspace.draft,
      [edit.field]: nextField,
    },
  };
  emitChange();
}
