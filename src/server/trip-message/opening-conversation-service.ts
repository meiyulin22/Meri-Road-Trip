import type { TripMessage } from "@/domain/trip-message/trip-message";
import type { TripState } from "@/domain/trip-state/trip-state";
import { openingAssistantMessageId } from "./opening-assistant-id";

export class OpeningConversationNotEligibleError extends Error {
  constructor() {
    super("This Journey is not awaiting an opening assistant response.");
    this.name = "OpeningConversationNotEligibleError";
  }
}

export function isPendingOpeningConversation(messages: readonly TripMessage[]): boolean {
  return messages.length === 1 && messages[0].role === "user";
}

type OpeningConversationDependencies = {
  readonly loadTripState: (tripId: string, ownerGuestId: string) => Promise<TripState>;
  readonly listMessages: (tripId: string, ownerGuestId: string) => Promise<TripMessage[]>;
  readonly generateReply: (input: {
    readonly message: string;
    readonly tripState: TripState;
    readonly requestId: string;
    readonly referenceDate: string;
    readonly timezone: string;
  }) => Promise<string>;
  readonly persistAssistant: (input: {
    readonly tripId: string;
    readonly ownerGuestId: string;
    readonly content: string;
  }) => Promise<TripMessage>;
};

export class OpeningConversationService {
  constructor(private readonly dependencies: OpeningConversationDependencies) {}

  async initialize(input: {
    readonly tripId: string;
    readonly ownerGuestId: string;
    readonly requestId: string;
    readonly referenceDate: string;
    readonly timezone: string;
  }): Promise<TripMessage> {
    const tripState = await this.dependencies.loadTripState(input.tripId, input.ownerGuestId);
    const messages = await this.dependencies.listMessages(input.tripId, input.ownerGuestId);
    const existing = existingOpeningAssistant(messages, input.tripId);
    if (existing) {
      return existing;
    }
    if (!isPendingOpeningConversation(messages)) {
      throw new OpeningConversationNotEligibleError();
    }

    const reply = await this.dependencies.generateReply({
      message: messages[0].content,
      tripState,
      requestId: input.requestId,
      referenceDate: input.referenceDate,
      timezone: input.timezone,
    });
    const currentMessages = await this.dependencies.listMessages(input.tripId, input.ownerGuestId);
    const winner = existingOpeningAssistant(currentMessages, input.tripId);
    if (winner) {
      return winner;
    }
    if (!isPendingOpeningConversation(currentMessages) ||
      currentMessages[0].id !== messages[0].id) {
      throw new OpeningConversationNotEligibleError();
    }

    return this.dependencies.persistAssistant({
      tripId: input.tripId,
      ownerGuestId: input.ownerGuestId,
      content: reply,
    });
  }
}

function existingOpeningAssistant(
  messages: readonly TripMessage[],
  tripId: string,
): TripMessage | null {
  const openingId = openingAssistantMessageId(tripId);
  const matching = messages.find((message) => message.id === openingId);
  if (matching && (matching.tripId !== tripId || matching.role !== "assistant" ||
    messages[0]?.role !== "user" || messages[1]?.id !== openingId)) {
    throw new OpeningConversationNotEligibleError();
  }
  return matching ?? null;
}
