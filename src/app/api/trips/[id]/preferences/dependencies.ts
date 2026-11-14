import { randomUUID } from "node:crypto";

/** The live services behind the preference routes, loaded when a request needs them. */
export async function preferenceDependencies() {
  const [{ journeyService }, { tripPreferenceRepository }, { labelPreference }] = await Promise.all([
    import("@/capabilities/journey/journey-service-instance"),
    import("@/capabilities/planning/trip-preference-repository-instance"),
    import("@/capabilities/planning/extract-plan-preferences"),
  ]);
  return {
    loadJourney: (tripId: string, owner: string) => journeyService.loadJourney(tripId, owner),
    listPreferences: (tripId: string) => tripPreferenceRepository.listByTripId(tripId),
    create: (preference: Parameters<typeof tripPreferenceRepository.create>[0]) => tripPreferenceRepository.create(preference),
    markRemoved: (tripId: string, id: string, at: string) => tripPreferenceRepository.markRemoved(tripId, id, at),
    labelPreference: (text: string, requestId: string) => labelPreference(text, requestId),
    now: () => new Date(),
    newId: () => randomUUID(),
  };
}
