import type { Locale } from "@/domain/locale/locale";
import type { TripMessage, TripMessagePresentation } from "@/domain/trip-message/trip-message";
import { isDestinationOpenToRecommendations, type TripState } from "@/domain/trip-state/trip-state";
import type { PresentationIntent } from "@/domain/trip-state/workspace-conversation";
import { meriReplies } from "./meri-replies";
import { recommendationLeadIn } from "./turn-reply";
import { openingAssistantMessageId } from "./opening-assistant-id";
import { destinationMissingGuidanceMessageId } from "./destination-missing-guidance";

export class OpeningConversationNotEligibleError extends Error {
  constructor() {
    super("This Journey is not awaiting an opening assistant response.");
    this.name = "OpeningConversationNotEligibleError";
  }
}

export function isPendingOpeningConversation(messages: readonly TripMessage[]): boolean {
  const relevant = withoutDestinationGuidance(messages);
  return relevant.length === 1 && relevant[0].role === "user";
}

function withoutDestinationGuidance(messages: readonly TripMessage[]): readonly TripMessage[] {
  const tripId = messages[0]?.tripId;
  if (!tripId) return messages;
  const guidanceId = destinationMissingGuidanceMessageId(tripId);
  return messages.filter((message) => message.id !== guidanceId ||
    message.role !== "assistant" || message.tripId !== tripId);
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
    readonly locale: Locale;
  }) => Promise<OpeningReply>;
  readonly persistAssistant: (input: {
    readonly tripId: string;
    readonly ownerGuestId: string;
    readonly content: string;
    readonly presentation?: TripMessagePresentation;
  }) => Promise<TripMessage>;
};

/** The model's opening reply, and whether the first message asked for recommendation cards. */
export interface OpeningReply {
  readonly reply: string;
  readonly presentationIntent: PresentationIntent;
}

export class OpeningConversationService {
  constructor(private readonly dependencies: OpeningConversationDependencies) {}

  async initialize(input: {
    readonly tripId: string;
    readonly ownerGuestId: string;
    readonly requestId: string;
    readonly referenceDate: string;
    readonly timezone: string;
    /** The language chosen on the landing page, for the model's opening reply. */
    readonly locale: Locale;
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

    const opening = await this.dependencies.generateReply({
      message: messages[0].content,
      tripState,
      requestId: input.requestId,
      referenceDate: input.referenceDate,
      timezone: input.timezone,
      locale: input.locale,
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

    // The same pending marker a Workspace turn uses: the browser asks for the cards next,
    // and they answer the first message, which is the user message right before this one.
    const recommends = opening.presentationIntent !== "none" &&
      isDestinationOpenToRecommendations(tripState.destination, "within");
    return this.dependencies.persistAssistant({
      tripId: input.tripId,
      ownerGuestId: input.ownerGuestId,
      content: recommends ? recommendationLeadIn(opening.reply, meriReplies[input.locale]) : opening.reply,
      ...(recommends ? { presentation: { type: "destination_recommendations_pending" as const, scope: "within" as const } } : {}),
    });
  }
}

function existingOpeningAssistant(
  messages: readonly TripMessage[],
  tripId: string,
): TripMessage | null {
  const relevant = withoutDestinationGuidance(messages);
  const openingId = openingAssistantMessageId(tripId);
  const matching = relevant.find((message) => message.id === openingId);
  if (matching && (matching.tripId !== tripId || matching.role !== "assistant" ||
    relevant[0]?.role !== "user" || relevant[1]?.id !== openingId)) {
    throw new OpeningConversationNotEligibleError();
  }
  return matching ?? null;
}
