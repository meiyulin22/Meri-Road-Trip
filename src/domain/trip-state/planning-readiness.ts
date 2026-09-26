import type { TripState } from "./trip-state";

export type LocationResolveReadiness =
  | { readonly canAttempt: true }
  | { readonly canAttempt: false; readonly reason: "destination_missing" };

export interface PlanningReadiness {
  readonly locationResolve: LocationResolveReadiness;
}

export type GeneratePlanReadiness =
  | { readonly canProceed: true; readonly destination: "selected" | "resolved" }
  | {
      readonly canProceed: false;
      readonly reason:
        | "destination_missing"
        | "destination_ambiguous"
        | "destination_unresolved"
        | "provider_error";
    };

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
