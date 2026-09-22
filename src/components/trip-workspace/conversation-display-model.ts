import type { TripMessage } from "@/domain/trip-message/trip-message";

export type ConversationMessageDelivery =
  | "sending"
  | "failed"
  | "revealing"
  | "persisted";

export interface ConversationDisplayMessage {
  readonly id: string;
  readonly identity: "temporary" | "persisted";
  readonly role: TripMessage["role"];
  readonly content: string;
  readonly visibleContent: string;
  readonly delivery: ConversationMessageDelivery;
}

export class ConversationDisplayModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConversationDisplayModelError";
  }
}

export function createInitialConversationMessages(
  messages: readonly TripMessage[],
): ConversationDisplayMessage[] {
  return messages.map(toCompletedDisplayMessage);
}

export function addOptimisticUserMessage(
  messages: readonly ConversationDisplayMessage[],
  input: {
    readonly id: string;
    readonly content: string;
  },
): ConversationDisplayMessage[] {
  return [
    ...messages,
    {
      id: input.id,
      identity: "temporary",
      role: "user",
      content: input.content,
      visibleContent: input.content,
      delivery: "sending",
    },
  ];
}

export function markTemporaryMessageSending(
  messages: readonly ConversationDisplayMessage[],
  temporaryId: string,
): ConversationDisplayMessage[] {
  return updateTemporaryDelivery(messages, temporaryId, "sending");
}

export function markTemporaryMessageFailed(
  messages: readonly ConversationDisplayMessage[],
  temporaryId: string,
): ConversationDisplayMessage[] {
  return updateTemporaryDelivery(messages, temporaryId, "failed");
}

export function reconcilePersistedTurn(
  messages: readonly ConversationDisplayMessage[],
  temporaryUserId: string,
  persistedMessages: readonly TripMessage[],
): ConversationDisplayMessage[] {
  const persistedUser = persistedMessages.find(
    (message) => message.role === "user",
  );
  const persistedAssistant = persistedMessages.find(
    (message) => message.role === "assistant",
  );

  if (!persistedUser || !persistedAssistant) {
    throw new ConversationDisplayModelError(
      "A persisted conversation turn must include user and assistant messages.",
    );
  }

  let userWasReconciled = false;
  const reconciled = messages.map((message) => {
    if (message.id !== temporaryUserId || message.identity !== "temporary") {
      return message;
    }

    userWasReconciled = true;
    return toCompletedDisplayMessage(persistedUser);
  });
  const withPersistedUser = userWasReconciled
    ? reconciled
    : [...reconciled, toCompletedDisplayMessage(persistedUser)];

  return [
    ...withPersistedUser.filter(
      (message) => message.id !== persistedAssistant.id,
    ),
    {
      id: persistedAssistant.id,
      identity: "persisted",
      role: "assistant",
      content: persistedAssistant.content,
      visibleContent: "",
      delivery: "revealing",
    },
  ];
}

export function revealNextAssistantChunk(
  messages: readonly ConversationDisplayMessage[],
  assistantId: string,
  chunkSize = 3,
): ConversationDisplayMessage[] {
  return messages.map((message) => {
    if (message.id !== assistantId || message.delivery !== "revealing") {
      return message;
    }

    const contentCharacters = Array.from(message.content);
    const visibleCharacterCount = Array.from(message.visibleContent).length;
    const nextVisibleContent = contentCharacters
      .slice(0, visibleCharacterCount + chunkSize)
      .join("");

    return {
      ...message,
      visibleContent: nextVisibleContent,
      delivery:
        nextVisibleContent === message.content ? "persisted" : "revealing",
    };
  });
}

function updateTemporaryDelivery(
  messages: readonly ConversationDisplayMessage[],
  temporaryId: string,
  delivery: "sending" | "failed",
): ConversationDisplayMessage[] {
  return messages.map((message) =>
    message.id === temporaryId && message.identity === "temporary"
      ? { ...message, delivery }
      : message,
  );
}

function toCompletedDisplayMessage(
  message: TripMessage,
): ConversationDisplayMessage {
  return {
    id: message.id,
    identity: "persisted",
    role: message.role,
    content: message.content,
    visibleContent: message.content,
    delivery: "persisted",
  };
}
