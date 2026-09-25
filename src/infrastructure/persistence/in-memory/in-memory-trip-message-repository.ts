import type { TripMessage } from "@/domain/trip-message/trip-message";
import type { TripMessageRepository } from "@/repositories/trip-message-repository";

export class InMemoryTripMessageRepository
  implements TripMessageRepository
{
  private readonly messages: TripMessage[] = [];

  createMessage(message: TripMessage): Promise<void> {
    this.messages.push(message);
    return Promise.resolve();
  }

  createTurn(
    userMessage: TripMessage,
    assistantMessage: TripMessage,
  ): Promise<void> {
    this.messages.push(userMessage, assistantMessage);
    return Promise.resolve();
  }

  listByTripId(tripId: string): Promise<TripMessage[]> {
    return Promise.resolve(
      this.messages
        .filter((message) => message.tripId === tripId)
        .sort(compareMessages),
    );
  }
}

function compareMessages(left: TripMessage, right: TripMessage): number {
  return (
    left.createdAt.localeCompare(right.createdAt) ||
    left.id.localeCompare(right.id)
  );
}
