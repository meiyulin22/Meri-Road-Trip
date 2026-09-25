import type { TripState } from "@/domain/trip-state/trip-state";

export function getWorkspaceTitle(tripState: TripState): string {
  if (tripState.name.state !== "missing") {
    return tripState.name.value;
  }

  return "新的旅程想法";
}
