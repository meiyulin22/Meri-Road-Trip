import type { TripStatus } from "@/domain/trip/trip";
import type { DestinationArea } from "@/domain/trip-state/destination-areas";

export interface JourneySummary {
  readonly id: string;
  readonly name: string;
  readonly destination: string | null;
  /** The saved places themselves, for the cover photo; empty when none are saved. */
  readonly destinationAreas: readonly DestinationArea[];
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly status: TripStatus;
  readonly updatedAt: string;
}

export interface JourneySummaryRepository {
  listByOwner(ownerGuestId: string): Promise<JourneySummary[]>;
}
