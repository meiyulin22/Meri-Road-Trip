import type { ChatTransport, UIMessage, UIMessageChunk } from "ai";

import type { TripMessage } from "@/domain/trip-message/trip-message";
import type { TripState } from "@/domain/trip-state/trip-state";

import { requestWorkspaceConversation } from "./workspace-conversation-model";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type CommittedWorkspaceTurn = {
  readonly temporaryUserId: string;
  readonly persistedUser: TripMessage;
  readonly persistedAssistant: TripMessage;
  readonly tripState: TripState;
};

function lastSubmittedUser(messages: readonly UIMessage[]): UIMessage {
  const message = messages.at(-1);
  if (!message || message.role !== "user") {
    throw new Error("The latest Workspace message must be from the user.");
  }
  return message;
}

function submittedText(message: UIMessage): string {
  if (message.parts.length !== 1 || message.parts[0].type !== "text") {
    throw new Error("Workspace messages must contain one text part.");
  }
  return message.parts[0].text;
}

export function reconcileCommittedUserId(
  messages: readonly UIMessage[],
  temporaryUserId: string,
  persistedUser: TripMessage,
): UIMessage[] {
  return messages.map((message) =>
    message.id === temporaryUserId && message.role === "user"
      ? { ...message, id: persistedUser.id, parts: [{ type: "text", text: persistedUser.content }] }
      : message,
  );
}

export class WorkspaceChatTransport implements ChatTransport<UIMessage> {
  constructor(
    private readonly tripId: string,
    private readonly onCommitted: (turn: CommittedWorkspaceTurn) => void,
    private readonly fetcher: Fetcher = fetch,
  ) {}

  async sendMessages({
    trigger,
    messages,
    abortSignal,
  }: Parameters<ChatTransport<UIMessage>["sendMessages"]>[0]): Promise<ReadableStream<UIMessageChunk>> {
    if (trigger !== "submit-message") {
      throw new Error("Workspace does not support assistant regeneration.");
    }

    const user = lastSubmittedUser(messages);
    const text = submittedText(user);
    const result = await requestWorkspaceConversation(
      text,
      this.tripId,
      (input, init) => this.fetcher(input, { ...init, signal: abortSignal }),
    );
    const [persistedUser, persistedAssistant] = result.messages;
    if (
      result.messages.length !== 2 ||
      persistedUser.role !== "user" ||
      persistedAssistant.role !== "assistant" ||
      persistedUser.tripId !== this.tripId ||
      persistedAssistant.tripId !== this.tripId ||
      persistedUser.id === persistedAssistant.id ||
      persistedUser.content !== text ||
      persistedAssistant.content !== result.interpretation.reply
    ) {
      throw new Error("The committed Workspace turn is invalid.");
    }

    this.onCommitted({
      temporaryUserId: user.id,
      persistedUser,
      persistedAssistant,
      tripState: result.tripState,
    });

    // The JSON API has already completed validation and persistence. These
    // chunks adapt its committed response to useChat; they are not model output.
    return new ReadableStream<UIMessageChunk>({
      start(controller) {
        controller.enqueue({ type: "start", messageId: persistedAssistant.id });
        controller.enqueue({ type: "text-start", id: persistedAssistant.id });
        controller.enqueue({ type: "text-delta", id: persistedAssistant.id, delta: persistedAssistant.content });
        controller.enqueue({ type: "text-end", id: persistedAssistant.id });
        controller.enqueue({ type: "finish" });
        controller.close();
      },
    });
  }

  async reconnectToStream(): Promise<null> {
    return null;
  }
}
