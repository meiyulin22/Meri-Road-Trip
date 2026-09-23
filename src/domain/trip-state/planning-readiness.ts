import type { TripState } from "./trip-state";

export type LocationResolveReadiness =
  | { readonly canAttempt: true }
  | { readonly canAttempt: false; readonly reason: "destination_missing" };

export interface PlanningReadiness {
  readonly locationResolve: LocationResolveReadiness;
}

export function evaluatePlanningReadiness(
  tripState: TripState,
): PlanningReadiness {
  if (tripState.destination.state === "missing") {
    return {
      locationResolve: {
        canAttempt: false,
        reason: "destination_missing",
      },
    };
  }

  return { locationResolve: { canAttempt: true } };
}
