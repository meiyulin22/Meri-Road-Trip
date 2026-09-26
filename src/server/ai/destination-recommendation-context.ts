import type { TripMessage } from "@/domain/trip-message/trip-message";
import type { TripState } from "@/domain/trip-state/trip-state";
import type { TripUserAction } from "@/domain/trip-user-action/trip-user-action";
import type { StructuredOutputConversationMessage } from "./kimi-client";

const MAX_MESSAGES = 10;
const MAX_CHARACTERS = 6_000;

export interface DestinationRecommendationContext {
  readonly action: TripUserAction;
  readonly tripState: TripState;
  readonly conversationHistory: readonly StructuredOutputConversationMessage[];
}

export function buildDestinationRecommendationContext(
  action: TripUserAction,
  tripState: TripState,
  messages: readonly TripMessage[],
): DestinationRecommendationContext {
  if (action.type !== "request_destination_recommendations" ||
    tripState.destination.state !== "missing") {
    throw new Error("Destination recommendation context is not eligible.");
  }
  const selected: StructuredOutputConversationMessage[] = [];
  let remaining = MAX_CHARACTERS;
  for (let index = messages.length - 1; index >= 0 && selected.length < MAX_MESSAGES; index -= 1) {
    const message = messages[index];
    if (message.tripId !== action.tripId) continue;
    if (message.content.length > remaining) break;
    selected.push({ role: message.role, content: message.content });
    remaining -= message.content.length;
  }
  return { action, tripState, conversationHistory: selected.reverse() };
}
