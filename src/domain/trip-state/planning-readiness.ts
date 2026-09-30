import type { TripState } from "./trip-state";

/**
 * An empty province remains a saved preference, but the traveler still needs to
 * choose a city before generating a plan.
 */
export type GeneratePlanReadiness =
  | { readonly canProceed: true; readonly destination: "selected" }
  | { readonly canProceed: false; readonly reason: "destination_missing" | "destination_area_only" | "destination_unverified" };

export function evaluateGeneratePlanReadiness(tripState: TripState): GeneratePlanReadiness {
  if (tripState.destination.state === "missing") return { canProceed: false, reason: "destination_missing" };
  if (tripState.destination.legacyText) return { canProceed: false, reason: "destination_unverified" };
  return tripState.destination.areas.some((area) => area.places.length > 0)
    ? { canProceed: true, destination: "selected" }
    : { canProceed: false, reason: "destination_area_only" };
}
