import type { JourneySummary, JourneySummaryRepository } from "@/repositories/journey-summary-repository";
import { readGuestId } from "@/server/identity/guest-identity";

type CookieReader = Parameters<typeof readGuestId>[0];

export async function loadMyJourneys(
  cookieReader: CookieReader,
  repository: JourneySummaryRepository,
): Promise<JourneySummary[]> {
  const ownerGuestId = readGuestId(cookieReader);

  if (!ownerGuestId) {
    return [];
  }

  return repository.listByOwner(ownerGuestId);
}
