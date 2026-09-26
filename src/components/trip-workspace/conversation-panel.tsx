"use client";

import { ArrowUp, ChevronDown, ChevronUp, ImageIcon, LoaderCircle } from "lucide-react";
import Image from "next/image";
import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import type { TripMessage } from "@/domain/trip-message/trip-message";
import type { TripState } from "@/domain/trip-state/trip-state";

import { nextRevealCharacterCount, visibleAssistantText } from "./conversation-reveal";
import { canSelectDestinationRecommendation, canUseDestinationGuidance, requestDestinationRecommendationsIfMissing, selectDestinationRecommendationAndApply } from "./destination-recommendation-model";
import { DestinationRecommendationCard } from "./destination-recommendation-card";
import { formatMessageTimestamp } from "./message-timestamp";
import { appendPersistedMessageIfAbsent, messageCreatedAt, recommendationPresentation, toWorkspaceUIMessages } from "./trip-message-ui-adapter";
import {
  reconcileCommittedUserId,
  WorkspaceChatTransport,
  type CommittedWorkspaceTurn,
} from "./workspace-chat-transport";
import styles from "./trip-workspace.module.css";

const workspaceConversationError =
  "发送结果暂时无法确认。请刷新旅程，查看最新消息和状态后再继续。";

function subscribeToBrowser(): () => void { return () => undefined; }
function browserSnapshot(): boolean { return true; }
function serverSnapshot(): boolean { return false; }

export function ConversationPanel({
  destinationGuidanceMessageId,
  guidanceMessage,
  initialMessages,
  isExpanded,
  onChooseDestination,
  onExpandedChange,
  onTripStateChange,
  tripId,
  tripState,
}: {
  readonly destinationGuidanceMessageId: string;
  readonly guidanceMessage: TripMessage | null;
  readonly initialMessages: readonly TripMessage[];
  readonly isExpanded: boolean;
  readonly onChooseDestination: () => void;
  readonly onExpandedChange: (expanded: boolean) => void;
  readonly onTripStateChange: (state: TripState) => void;
  readonly tripId: string;
  readonly tripState: TripState;
}) {
  const [message, setMessage] = useState("");
  const [recommendationPending, setRecommendationPending] = useState(false);
  const [recommendationError, setRecommendationError] = useState(false);
  const recommendationInFlight = useRef(false);
  const selectionInFlight = useRef(false);
  const [selectionPendingId, setSelectionPendingId] = useState<string | null>(null);
  const [selectionErrorId, setSelectionErrorId] = useState<string | null>(null);
  const [revealing, setRevealing] = useState<{
    readonly id: string;
    readonly visibleCharacters: number;
  } | null>(null);
  const messageHistoryRef = useRef<HTMLDivElement>(null);

  function handleCommittedTurn(turn: CommittedWorkspaceTurn): void {
    onTripStateChange(turn.tripState);
    setRevealing({ id: turn.persistedAssistant.id, visibleCharacters: 0 });
    setMessages((current) =>
      reconcileCommittedUserId(current, turn.temporaryUserId, turn.persistedUser),
    );
  }

  const { messages, sendMessage, setMessages, status } = useChat({
    id: tripId,
    messages: toWorkspaceUIMessages(initialMessages),
    transport: new WorkspaceChatTransport(tripId, handleCommittedTurn),
  });
  const isSubmitting = status === "submitted" || status === "streaming";
  const hasError = status === "error";
  const latestMessage = messages.at(-1);
  const localNow = useSyncExternalStore(subscribeToBrowser, browserSnapshot, serverSnapshot) ? new Date() : null;
  const guidanceAvailable = canUseDestinationGuidance(tripState);
  const recommendationSelectionAvailable = canSelectDestinationRecommendation(tripState);

  useEffect(() => {
    if (!guidanceMessage) return;
    setMessages((current) => appendPersistedMessageIfAbsent(current, guidanceMessage));
  }, [guidanceMessage, setMessages]);

  useEffect(() => {
    const history = messageHistoryRef.current;
    if (history !== null) {
      history.scrollTop = history.scrollHeight;
    }
  }, [hasError, isExpanded, isSubmitting, messages, revealing]);

  useEffect(() => {
    if (!revealing) {
      return;
    }
    const assistant = messages.find((item) => item.id === revealing.id);
    const content = assistant ? messageText(assistant) : "";
    const length = Array.from(content).length;
    if (length === 0 || revealing.visibleCharacters >= length) {
      return;
    }
    const timer = window.setTimeout(() => {
      setRevealing((current) => current?.id === revealing.id
        ? { ...current, visibleCharacters: nextRevealCharacterCount(content, current.visibleCharacters) }
        : current);
    }, 42);
    return () => window.clearTimeout(timer);
  }, [messages, revealing]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const submittedMessage = message.trim();
    if (submittedMessage === "" || status !== "ready") {
      return;
    }
    onExpandedChange(true);
    setMessage("");
    void sendMessage({ text: submittedMessage });
  }

  async function handleRecommendationRequest(): Promise<void> {
    if (!guidanceAvailable || recommendationInFlight.current) return;
    recommendationInFlight.current = true;
    setRecommendationPending(true);
    setRecommendationError(false);
    try {
      const persisted = await requestDestinationRecommendationsIfMissing(tripId, tripState);
      if (persisted) setMessages((current) => appendPersistedMessageIfAbsent(current, persisted));
    } catch {
      setRecommendationError(true);
    } finally {
      recommendationInFlight.current = false;
      setRecommendationPending(false);
    }
  }

  async function handleRecommendationSelection(id: string, name: string): Promise<void> {
    if (!recommendationSelectionAvailable || selectionInFlight.current) return;
    selectionInFlight.current = true;
    setSelectionPendingId(id);
    setSelectionErrorId(null);
    try {
      await selectDestinationRecommendationAndApply(tripId, name, onTripStateChange);
    } catch {
      setSelectionErrorId(id);
    } finally {
      selectionInFlight.current = false;
      setSelectionPendingId(null);
    }
  }

  function handleChooseDestination(): void {
    if (guidanceAvailable) onChooseDestination();
  }

  function handleMessageKeyDown(
    event: React.KeyboardEvent<HTMLInputElement>,
  ): void {
    if (event.key === "Enter" && event.nativeEvent.isComposing) {
      event.preventDefault();
    }
  }

  return (
    <section
      aria-labelledby="conversation-title"
      className={styles.conversationDock}
      data-expanded={isExpanded ? "true" : "false"}
      data-region="conversation-dock"
    >
      <header className={styles.dockHeader}>
        <div className={styles.regionHeading}>
          <p>THE JOURNEY STARTS WITH A CONVERSATION</p>
          <h2 id="conversation-title">和 Meri 一起，把想法变成旅程</h2>
        </div>
        <button
          aria-expanded={isExpanded}
          aria-label={isExpanded ? "收起对话" : "展开对话"}
          className={styles.dockToggle}
          onClick={() => onExpandedChange(!isExpanded)}
          type="button"
        >
          {isExpanded ? (
            <ChevronDown aria-hidden="true" size={17} />
          ) : (
            <ChevronUp aria-hidden="true" size={17} />
          )}
        </button>
      </header>

      {isExpanded ? (
        <div className={styles.messageHistory} ref={messageHistoryRef}>
          {messages.length === 0 ? (
            <>
              <article className={styles.meriMessage}>
                <Image
                  alt=""
                  height={84}
                  src="/companion/home-v2-companion.png"
                  width={84}
                />
                <div>
                  <MessageHeader speaker="Meri" createdAt={null} now={localNow} />
                  <p>{getConversationOpening(tripState)}</p>
                </div>
              </article>
              <p className={styles.conversationHint}>
                旅程不需要一次想完整，我们可以边聊边整理。
              </p>
            </>
          ) : null}
          {messages.map((conversationMessage, index) =>
            conversationMessage.role === "assistant" ? (
              <article className={styles.meriMessage} key={conversationMessage.id}>
                <Image
                  alt=""
                  height={84}
                  src="/companion/home-v2-companion.png"
                  width={84}
                />
                <div>
                  <MessageHeader speaker="Meri" createdAt={messageCreatedAt(conversationMessage)} now={localNow} />
                  <p>
                    {revealing?.id === conversationMessage.id
                      ? visibleAssistantText(messageText(conversationMessage), revealing.visibleCharacters)
                      : messageText(conversationMessage)}
                    {revealing?.id === conversationMessage.id &&
                    revealing.visibleCharacters < Array.from(messageText(conversationMessage)).length ? (
                      <span className={styles.revealCursor} aria-hidden="true">
                        ▍
                      </span>
                    ) : null}
                  </p>
                  {conversationMessage.id === destinationGuidanceMessageId ? (
                    <div className={styles.guidanceActions}>
                      <button disabled={recommendationPending || !guidanceAvailable} onClick={() => void handleRecommendationRequest()} type="button">
                        {recommendationPending ? "正在推荐…" : "帮我推荐"}
                      </button>
                      <button disabled={!guidanceAvailable} onClick={handleChooseDestination} type="button">我自己选</button>
                    </div>
                  ) : null}
                  {recommendationPresentation(conversationMessage)?.destinations ? (
                    <div className={styles.recommendationGrid}>
                      {recommendationPresentation(conversationMessage)?.destinations.map((destination) => (
                        <DestinationRecommendationCard
                          destination={destination}
                          disabled={!recommendationSelectionAvailable || selectionPendingId !== null}
                          error={selectionErrorId === destination.id}
                          key={destination.id}
                          onSelect={() => void handleRecommendationSelection(destination.id, destination.name)}
                          pending={selectionPendingId === destination.id}
                          selected={tripState.destination.state === "known" && tripState.destination.value === destination.name}
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              </article>
            ) : (
              <article className={styles.userMessage} key={conversationMessage.id}>
                <MessageHeader speaker="你" createdAt={messageCreatedAt(conversationMessage)} now={localNow} />
                <p>{messageText(conversationMessage)}</p>
                {index === messages.length - 1 && isSubmitting ? (
                  <span className={styles.messageDelivery}>发送中…</span>
                ) : null}
                {index === messages.length - 1 && hasError ? (
                  <span className={`${styles.messageDelivery} ${styles.messageFailed}`}>
                    发送结果未确认
                  </span>
                ) : null}
              </article>
            ),
          )}
          {recommendationError ? <p role="alert">推荐暂时没有完成，请重试。</p> : null}
          {isSubmitting ? (
            <p className={styles.conversationStatus} role="status">
              Meri 正在理解这条消息…
            </p>
          ) : null}
          {hasError ? (
            <div className={styles.conversationError} role="alert">
              <span>{workspaceConversationError}</span>
              <button
                onClick={() => window.location.reload()}
                type="button"
              >
                刷新核对
              </button>
            </div>
          ) : null}
        </div>
      ) : latestMessage?.role === "user" ? (
        <article className={styles.userMessage}>
          <MessageHeader speaker="你" createdAt={messageCreatedAt(latestMessage)} now={localNow} />
          <p>{messageText(latestMessage)}</p>
        </article>
      ) : (
        <article className={styles.meriMessage}>
          <Image
            alt=""
            height={84}
            src="/companion/home-v2-companion.png"
            width={84}
          />
          <div>
            <MessageHeader speaker="Meri" createdAt={latestMessage ? messageCreatedAt(latestMessage) : null} now={localNow} />
            <p>{latestMessage ? messageText(latestMessage) : getConversationOpening(tripState)}</p>
          </div>
        </article>
      )}

      <form
        aria-busy={isSubmitting}
        className={styles.conversationComposer}
        data-region="conversation-composer"
        onSubmit={handleSubmit}
      >
        <button aria-label="添加内容（暂不可用）" disabled type="button">
          <ImageIcon aria-hidden="true" size={21} />
        </button>
        <label className={styles.srOnly} htmlFor="workspace-message">
          告诉 Meri 你还在想什么
        </label>
        <input
          disabled={isSubmitting || hasError}
          id="workspace-message"
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={handleMessageKeyDown}
          placeholder="告诉 Meri 你的想法…"
          type="text"
          value={message}
        />
        <button
          aria-label="发送消息"
          disabled={isSubmitting || hasError || message.trim() === ""}
          type="submit"
        >
          {isSubmitting ? (
            <LoaderCircle aria-hidden="true" className={styles.loadingIcon} size={18} />
          ) : (
            <ArrowUp aria-hidden="true" size={21} />
          )}
        </button>
      </form>
    </section>
  );
}

function MessageHeader({ speaker, createdAt, now }: {
  readonly speaker: "Meri" | "你";
  readonly createdAt: string | null;
  readonly now: Date | null;
}) {
  return (
    <div className={styles.messageHeader}>
      <span>{speaker}</span>
      {createdAt && now ? <time dateTime={createdAt}>{formatMessageTimestamp(createdAt, now)}</time> : null}
    </div>
  );
}

function messageText(message: UIMessage): string {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

function getConversationOpening(tripState: TripState): string {
  if (tripState.startDate.state !== "missing") {
    return `我已经记下了你的想法，也保留了“${tripState.startDate.value}”这个时间范围。你可以继续告诉我任何还在考虑的事情。`;
  }

  return "我已经记下了你的旅行想法。信息不需要一次完整，我们可以边聊边把旅程变清晰。";
}
