import type { UIMessage } from "ai";

import type { TripMessage } from "@/domain/trip-message/trip-message";

export function toWorkspaceUIMessages(messages: readonly TripMessage[]): UIMessage[] {
  return messages.map((message) => ({
    id: message.id,
    role: message.role,
    parts: [{ type: "text", text: message.content }],
  }));
}

export function appendPersistedMessageIfAbsent(
  messages: UIMessage[],
  persisted: TripMessage,
): UIMessage[] {
  return messages.some((message) => message.id === persisted.id)
    ? messages
    : [...messages, ...toWorkspaceUIMessages([persisted])];
}
