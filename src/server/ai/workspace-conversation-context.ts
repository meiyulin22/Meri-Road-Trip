import type { TripMessage } from "@/domain/trip-message/trip-message";
import type { StructuredOutputConversationMessage } from "@/server/ai/kimi-client";

const MAX_RECENT_TURNS = 5;
const MAX_HISTORY_CHARACTERS = 6_000;

export function selectRecentConversationMessages(
  messages: readonly TripMessage[],
): StructuredOutputConversationMessage[] {
  const selectedTurns: StructuredOutputConversationMessage[][] = [];
  let remainingCharacters = MAX_HISTORY_CHARACTERS;

  for (let index = messages.length - 1; index > 0; index -= 1) {
    const assistant = messages[index];
    const user = messages[index - 1];
    if (assistant.role !== "assistant" || user.role !== "user") {
      continue;
    }

    const turnCharacters = user.content.length + assistant.content.length;
    if (turnCharacters > remainingCharacters) {
      break;
    }

    selectedTurns.push([
      { role: "user", content: user.content },
      { role: "assistant", content: assistant.content },
    ]);
    remainingCharacters -= turnCharacters;
    index -= 1;

    if (selectedTurns.length === MAX_RECENT_TURNS) {
      break;
    }
  }

  return selectedTurns.reverse().flat();
}
