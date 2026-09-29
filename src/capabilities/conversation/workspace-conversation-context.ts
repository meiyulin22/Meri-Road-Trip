import type { TripMessage } from "@/domain/trip-message/trip-message";
import type { StructuredOutputConversationMessage } from "@/platform/llm/kimi-client";

import { conversationHistoryContent } from "./conversation-history-content";

const MAX_RECENT_TURNS = 5;
const MAX_HISTORY_CHARACTERS = 6_000;

export function selectRecentConversationMessages(
  messages: readonly TripMessage[],
): StructuredOutputConversationMessage[] {
  const entries = mergeConsecutiveAssistantMessages(messages);
  const selectedTurns: StructuredOutputConversationMessage[][] = [];
  let remainingCharacters = MAX_HISTORY_CHARACTERS;

  for (let index = entries.length - 1; index > 0; index -= 1) {
    const assistant = entries[index];
    const user = entries[index - 1];
    if (assistant.role !== "assistant" || user.role !== "user") {
      continue;
    }

    const turnCharacters = user.content.length + assistant.content.length;
    if (turnCharacters > remainingCharacters) {
      break;
    }

    selectedTurns.push([user, assistant]);
    remainingCharacters -= turnCharacters;
    index -= 1;

    if (selectedTurns.length === MAX_RECENT_TURNS) {
      break;
    }
  }

  return selectedTurns.reverse().flat();
}

/**
 * Pressing a card or the recommend button adds an assistant message with no user
 * message before it, and 「好，目的地定为潮州市、汕头市了」 is how the model learns
 * what was picked. Pairing strictly by user/assistant would drop exactly those, so
 * a run of assistant messages is folded into the turn it follows.
 */
function mergeConsecutiveAssistantMessages(
  messages: readonly TripMessage[],
): StructuredOutputConversationMessage[] {
  const entries: StructuredOutputConversationMessage[] = [];
  for (const message of messages) {
    const content = conversationHistoryContent(message);
    const previous = entries.at(-1);
    if (message.role === "assistant" && previous?.role === "assistant") {
      entries[entries.length - 1] = { role: "assistant", content: `${previous.content}\n\n${content}` };
      continue;
    }
    entries.push({ role: message.role, content });
  }
  return entries;
}
