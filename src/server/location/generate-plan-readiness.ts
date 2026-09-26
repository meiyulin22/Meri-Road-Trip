import { evaluatePlanningReadiness, type GeneratePlanReadiness } from "@/domain/trip-state/planning-readiness";
import type { TripState } from "@/domain/trip-state/trip-state";

import type { LocationService } from "./location-service";

export async function checkGeneratePlanReadiness(
  tripState: TripState,
  locationService: Pick<LocationService, "resolve">,
): Promise<GeneratePlanReadiness> {
  const readiness = evaluatePlanningReadiness(tripState).locationResolve;
  if (!readiness.canAttempt) {
    return { canProceed: false, reason: readiness.reason };
  }

  const resolution = await locationService.resolve(tripState);
  switch (resolution.status) {
    case "selected":
    case "resolved":
      return { canProceed: true, destination: resolution.status };
    case "ambiguous":
      return { canProceed: false, reason: "destination_ambiguous" };
    case "unresolved":
      return { canProceed: false, reason: "destination_unresolved" };
    case "provider_error":
      return { canProceed: false, reason: "provider_error" };
    case "not_ready":
      return { canProceed: false, reason: resolution.reason };
  }
}
