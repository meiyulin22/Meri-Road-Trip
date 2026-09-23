import type { UIMessage } from "ai";

import type { TripMessage } from "@/domain/trip-message/trip-message";

export function toWorkspaceUIMessages(messages: readonly TripMessage[]): UIMessage[] {
  return messages.map((message) => ({
    id: message.id,
    role: message.role,
    parts: [{ type: "text", text: message.content }],
  }));
}
