import type { TripState } from "@/domain/trip-state/trip-state";

/** The Journey's own name, or the interface's word for one that has none yet. */
export function getWorkspaceTitle(tripState: TripState, untitled: string): string {
  if (tripState.name.state !== "missing") {
    return tripState.name.value;
  }

  return untitled;
}
