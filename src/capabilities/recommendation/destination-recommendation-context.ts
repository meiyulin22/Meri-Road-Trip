import type { TripMessage } from "@/domain/trip-message/trip-message";
import { isDestinationOpenToRecommendations, type TripState } from "@/domain/trip-state/trip-state";
import type { StructuredOutputConversationMessage } from "@/platform/llm/kimi-client";
import { conversationHistoryContent } from "@/capabilities/conversation/conversation-history-content";

const MAX_MESSAGES = 10;
const MAX_CHARACTERS = 6_000;

/**
 * Recommendations are only asked for in conversation now; the source is kept so the
 * workflow log still says which entry point ran.
 */
export type DestinationRecommendationContext = {
  readonly source: "conversation";
  readonly tripState: TripState;
  readonly conversationHistory: readonly StructuredOutputConversationMessage[];
};

export function buildConversationalDestinationRecommendationContext(
  tripId: string,
  tripState: TripState,
  messages: readonly TripMessage[],
  currentUserText: string,
): DestinationRecommendationContext {
  if (!isDestinationOpenToRecommendations(tripState.destination) || currentUserText.trim() === "") {
    throw new Error("Conversational destination recommendation context is not eligible.");
  }
  const history = selectMessages(messages, tripId, currentUserText.length);
  return { source: "conversation", tripState,
    conversationHistory: [...history, { role: "user", content: currentUserText }] };
}

function selectMessages(messages: readonly TripMessage[], tripId: string, reservedCharacters = 0): StructuredOutputConversationMessage[] {
  const selected: StructuredOutputConversationMessage[] = [];
  let remaining = MAX_CHARACTERS - reservedCharacters;
  for (let index = messages.length - 1; index >= 0 && selected.length < MAX_MESSAGES - (reservedCharacters > 0 ? 1 : 0); index -= 1) {
    const message = messages[index];
    if (message.tripId !== tripId) continue;
    const content = conversationHistoryContent(message);
    if (content.length > remaining) break;
    selected.push({ role: message.role, content });
    remaining -= content.length;
  }
  return selected.reverse();
}
