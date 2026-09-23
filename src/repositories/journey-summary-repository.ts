import type { TripStatus } from "@/domain/trip/trip";

export interface JourneySummary {
  readonly id: string;
  readonly name: string;
  readonly destination: string | null;
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly status: TripStatus;
  readonly updatedAt: string;
}

export interface JourneySummaryRepository {
  listByOwner(ownerGuestId: string): Promise<JourneySummary[]>;
}
