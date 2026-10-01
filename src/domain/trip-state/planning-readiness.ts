import type { TripState } from "./trip-state";

/**
 * A province with no city chosen inside it is a real destination: planning works
 * across the whole province. Only an empty destination, or an old free-text one that
 * was never verified, leaves nothing trustworthy to plan around.
 */
export type GeneratePlanReadiness =
  | { readonly canProceed: true; readonly destination: "selected" }
  | { readonly canProceed: false; readonly reason: "destination_missing" | "destination_unverified" };

export function evaluateGeneratePlanReadiness(tripState: TripState): GeneratePlanReadiness {
  if (tripState.destination.state === "missing") return { canProceed: false, reason: "destination_missing" };
  if (tripState.destination.legacyText) return { canProceed: false, reason: "destination_unverified" };
  return { canProceed: true, destination: "selected" };
}
