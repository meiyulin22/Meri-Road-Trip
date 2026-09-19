import type { TripDraft } from "@/domain/trip-draft/trip-draft";

export interface TemporaryTripWorkspaceState {
  readonly draft: TripDraft;
  readonly initialMessage: string;
}

let currentWorkspace: TemporaryTripWorkspaceState | null = null;

export function setTemporaryTripWorkspace(
  draft: TripDraft,
  initialMessage: string,
): void {
  currentWorkspace = { draft, initialMessage };
}

export function getTemporaryTripWorkspace(): TemporaryTripWorkspaceState | null {
  return currentWorkspace;
}

export function clearTemporaryTripWorkspace(): void {
  currentWorkspace = null;
}
