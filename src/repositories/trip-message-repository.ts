import type { TripMessage } from "@/domain/trip-message/trip-message";

export interface TripMessageRepository {
  createMessage(message: TripMessage): Promise<void>;
  createTurn(
    userMessage: TripMessage,
    assistantMessage: TripMessage,
  ): Promise<void>;
  listByTripId(tripId: string): Promise<TripMessage[]>;
}
