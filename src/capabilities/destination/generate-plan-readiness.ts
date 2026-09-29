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

  // Places picked from Meri's own recommendations are already what they claim to be,
  // and several of them cannot be looked up as one expression: 「四川省 稻城、四姑娘山」
  // is not a name any provider holds. Which spots inside them the trip visits is
  // Generate plan's own work, so the destination is settled once one place is chosen.
  const areas = tripState.destination.state === "missing" ? undefined : tripState.destination.areas;
  if (areas?.length) {
    return areas.some((area) => area.places.length > 0)
      ? { canProceed: true, destination: "selected" }
      : { canProceed: false, reason: "destination_area_only" };
  }

  const resolution = await locationService.resolve(tripState);
  switch (resolution.status) {
    case "selected":
    case "resolved":
      return { canProceed: true, destination: resolution.status };
    case "ambiguous":
      return { canProceed: false, reason: "destination_ambiguous" };
    case "area":
      return { canProceed: false, reason: "destination_area_only" };
    case "unresolved":
      return { canProceed: false, reason: "destination_unresolved" };
    case "provider_error":
      return { canProceed: false, reason: "provider_error" };
    case "not_ready":
      return { canProceed: false, reason: resolution.reason };
  }
}
