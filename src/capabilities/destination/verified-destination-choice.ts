import type { DestinationChoice } from "@/domain/trip-message/trip-message";
import { destinationPreferenceId } from "@/domain/trip-message/destination-choice-identity";
import { resolveDestinationCandidates } from "@/domain/location/destination-resolution-policy";
import type { DestinationPick } from "@/domain/trip-state/destination-areas";

import type { LocationService } from "./location-service";
import { picksFromSearch, resolveDestinationPlace } from "./resolve-destination-place";

export type VerifiedChoice =
  | { readonly status: "verified"; readonly pick: DestinationPick }
  | { readonly status: "unresolved" | "provider_error" };

/** Recheck a persisted offer against Amap before it can alter the Journey. */
export async function verifyDestinationChoice(
  choice: DestinationChoice,
  service: Pick<LocationService, "search">,
): Promise<VerifiedChoice> {
  if (choice.id === `province:${choice.province}` && choice.city === undefined && choice.spot === undefined) {
    return { status: "verified", pick: { province: choice.province, place: null, spot: null } };
  }
  const result = await service.search(choice.spot ?? choice.name);
  if (result.status !== "success") return { status: "provider_error" };
  if (choice.city && choice.id === destinationPreferenceId(choice.province, choice.city, choice.spot ?? null)) {
    // Revalidate the province/city/preference, rather than silently choosing one
    // of several map records whose precise identity the user never selected.
    const resolution = await resolveDestinationPlace(choice.spot ?? choice.city,
      async (expression) => resolveDestinationCandidates(expression, result.candidates));
    const picks = resolution.status === "resolved" ? [resolution.pick]
      : resolution.status === "ambiguous" ? resolution.options : [];
    const matches = picks.some((pick) => pick.place !== null &&
      destinationPreferenceId(pick.province, pick.place, pick.spot) === choice.id);
    return matches ? { status: "verified", pick: { province: choice.province, place: choice.city, spot: choice.spot ?? null } }
      : { status: "unresolved" };
  }
  const candidates = picksFromSearch(result.candidates).filter((pick) =>
    pick.province === choice.province &&
    (choice.city === undefined || pick.place === choice.city) &&
    (choice.spot === undefined || pick.spot !== null),
  );
  const matchingId = candidates.find((pick) => pick.id === choice.id);
  const exactName = candidates.filter((pick) => pick.label === choice.name);
  if (!matchingId && choice.city === undefined && choice.spot === undefined && exactName.length > 1) {
    const cities = new Set(exactName.filter((pick) => pick.place !== null && pick.spot === null)
      .map((pick) => pick.place));
    if (cities.size === 1 && exactName.every((pick) => pick.place !== null && pick.spot === null)) {
      return { status: "verified", pick: { province: choice.province, place: [...cities][0], spot: null } };
    }
  }
  const verified = matchingId ?? (exactName.length === 1 ? exactName[0] : undefined);
  if (verified === undefined) return { status: "unresolved" };
  return { status: "verified", pick: {
    province: verified.province, place: verified.place,
    spot: choice.spot === undefined ? verified.spot : choice.spot,
  } };
}
