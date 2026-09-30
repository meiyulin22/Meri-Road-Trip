import type { DestinationChoice } from "@/domain/trip-message/trip-message";
import type { DestinationPick } from "@/domain/trip-state/destination-areas";

import type { LocationService } from "./location-service";
import { picksFromSearch } from "./resolve-destination-place";

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
  const candidates = picksFromSearch(result.candidates).filter((pick) =>
    pick.province === choice.province &&
    (choice.city === undefined || pick.place === choice.city) &&
    (choice.spot === undefined || pick.spot !== null),
  );
  const matchingId = candidates.find((pick) => pick.id === choice.id);
  const exactName = candidates.filter((pick) => pick.label === choice.name);
  const verified = matchingId ?? (exactName.length === 1 ? exactName[0] : undefined);
  if (verified === undefined) return { status: "unresolved" };
  return { status: "verified", pick: {
    province: verified.province, place: verified.place,
    spot: choice.spot === undefined ? verified.spot : choice.spot,
  } };
}
