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

  createAssistantIfAbsent(message: TripMessage): Promise<TripMessage> {
    const existing = this.messages.find((item) => item.id === message.id);
    if (existing) {
      if (existing.tripId !== message.tripId || existing.role !== "assistant") {
        return Promise.reject(new Error("Assistant ID conflicts with an unrelated message."));
      }
      return Promise.resolve(existing);
    }
    this.messages.push(message);
    return Promise.resolve(message);
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
