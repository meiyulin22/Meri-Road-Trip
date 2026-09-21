import type { Trip } from "@/domain/trip/trip";
import { readGuestId } from "@/server/identity/guest-identity";
import type { TripService } from "@/server/trip/trip-service";

type CookieReader = Parameters<typeof readGuestId>[0];
type TripLister = Pick<TripService, "listTrips">;

export async function loadMyJourneys(
  cookieReader: CookieReader,
  tripService: TripLister,
): Promise<Trip[]> {
  const ownerGuestId = readGuestId(cookieReader);

  if (!ownerGuestId) {
    return [];
  }

  return tripService.listTrips(ownerGuestId);
}
