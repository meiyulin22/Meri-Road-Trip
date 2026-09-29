import type { TripMessage } from "@/domain/trip-message/trip-message";
import { isDestinationOpenToRecommendations, type TripState } from "@/domain/trip-state/trip-state";
import type { TripUserAction } from "@/domain/trip-user-action/trip-user-action";
import type { StructuredOutputConversationMessage } from "@/platform/llm/kimi-client";

const MAX_MESSAGES = 10;
const MAX_CHARACTERS = 6_000;

export type DestinationRecommendationContext = {
  readonly tripState: TripState;
  readonly conversationHistory: readonly StructuredOutputConversationMessage[];
} & (
  { readonly source: "explicit_action"; readonly action: TripUserAction } |
  { readonly source: "conversation" }
);

export function buildDestinationRecommendationContext(
  action: TripUserAction,
  tripState: TripState,
  messages: readonly TripMessage[],
): DestinationRecommendationContext {
  if (action.type !== "request_destination_recommendations" ||
    !isDestinationOpenToRecommendations(tripState.destination)) {
    throw new Error("Destination recommendation context is not eligible.");
  }
  return { source: "explicit_action", action, tripState, conversationHistory: selectMessages(messages, action.tripId) };
}

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
    if (message.content.length > remaining) break;
    selected.push({ role: message.role, content: message.content });
    remaining -= message.content.length;
  }
  return selected.reverse();
}
