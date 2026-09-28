import type { TripUserAction } from "@/domain/trip-user-action/trip-user-action";

export interface TripUserActionRepository {
  create(action: TripUserAction): Promise<TripUserAction>;
}
