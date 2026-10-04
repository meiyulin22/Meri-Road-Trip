import type { TripMessage, TripMessagePresentation } from "@/domain/trip-message/trip-message";

export interface TripMessageRepository {
  createMessage(message: TripMessage): Promise<void>;
  createAssistantIfAbsent(message: TripMessage): Promise<TripMessage>;
  createTurn(
    userMessage: TripMessage,
    assistantMessage: TripMessage,
  ): Promise<void>;
  listByTripId(tripId: string): Promise<TripMessage[]>;
  /**
   * The one change a saved message accepts: its cards' photos, which arrive after the
   * cards were shown. Content, role and time never change.
   */
  updateAssistantPresentation(tripId: string, messageId: string, presentation: TripMessagePresentation): Promise<void>;
}
