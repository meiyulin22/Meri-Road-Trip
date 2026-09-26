import type { UIMessage } from "ai";

import type { TripMessage } from "@/domain/trip-message/trip-message";

export function toWorkspaceUIMessages(messages: readonly TripMessage[]): UIMessage[] {
  return messages.map((message) => ({
    id: message.id,
    role: message.role,
    parts: [{ type: "text", text: message.content }],
    metadata: { createdAt: message.createdAt, ...(message.presentation ? { presentation: message.presentation } : {}) },
  }));
}

export function messageCreatedAt(message: UIMessage): string | null {
  const metadata = message.metadata;
  return typeof metadata === "object" && metadata !== null && "createdAt" in metadata &&
    typeof metadata.createdAt === "string" ? metadata.createdAt : null;
}

export function recommendationPresentation(message: UIMessage): TripMessage["presentation"] {
  const metadata = message.metadata;
  if (typeof metadata !== "object" || metadata === null || !("presentation" in metadata)) return undefined;
  return metadata.presentation as TripMessage["presentation"];
}

export function appendPersistedMessageIfAbsent(
  messages: UIMessage[],
  persisted: TripMessage,
): UIMessage[] {
  return messages.some((message) => message.id === persisted.id)
    ? messages
    : [...messages, ...toWorkspaceUIMessages([persisted])];
}
