"use client";

import { ArrowUp, ChevronDown, ChevronUp, ImageIcon, LoaderCircle } from "lucide-react";
import Image from "next/image";
import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import type { TripMessage } from "@/domain/trip-message/trip-message";
import type { TripState } from "@/domain/trip-state/trip-state";

import { nextRevealCharacterCount, visibleAssistantText } from "./conversation-reveal";
import { selectDestinationRecommendation } from "./destination-recommendation-model";
import { DestinationChoicesCard } from "./destination-choices-card";
import { GeneratePlanAction } from "./generate-plan-action";
import { formatMessageTimestamp } from "./message-timestamp";
import { appendPersistedMessageIfAbsent, destinationChoicePresentation, messageCreatedAt, toWorkspaceUIMessages } from "./trip-message-ui-adapter";
import { DestinationOfferExpiredError, DestinationSelectionFollowUpError } from "./workspace-conversation-model";
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
  initialMessages,
  isExpanded,
  onChooseDestination,
  onExpandedChange,
  onTripStateChange,
  tripId,
  tripState,
}: {
  readonly initialMessages: readonly TripMessage[];
  readonly isExpanded: boolean;
  readonly onChooseDestination: () => void;
  readonly onExpandedChange: (expanded: boolean) => void;
  readonly onTripStateChange: (state: TripState) => void;
  readonly tripId: string;
  readonly tripState: TripState;
}) {
  const [message, setMessage] = useState("");
  const selectionInFlight = useRef(false);
  const [selectionPendingMessageId, setSelectionPendingMessageId] = useState<string | null>(null);
  const [selectionErrorMessageId, setSelectionErrorMessageId] = useState<string | null>(null);
  const [selectionNotice, setSelectionNotice] = useState<string | null>(null);
  const [closedOfferIds, setClosedOfferIds] = useState<readonly string[]>([]);
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

  function closeCurrentOffer(): void {
    if (latestMessage && destinationChoicePresentation(latestMessage)) {
      setClosedOfferIds((current) => [...new Set([...current, latestMessage.id])]);
    }
  }

  function offerIsActive(offered: UIMessage): boolean {
    const presentation = destinationChoicePresentation(offered);
    return offered.id === latestMessage?.id && !closedOfferIds.includes(offered.id) &&
      !!presentation && (presentation.mode !== "replace" ||
        presentation.baseDestination === JSON.stringify(tripState.destination));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const submittedMessage = message.trim();
    if (submittedMessage === "" || status !== "ready" || selectionInFlight.current) {
      return;
    }
    closeCurrentOffer();
    onExpandedChange(true);
    setMessage("");
    void sendMessage({ text: submittedMessage });
  }

  async function handleRecommendationSelection(messageId: string, destinationIds: readonly string[]): Promise<void> {
    const offered = messages.find((item) => item.id === messageId);
    if (!offered || !destinationChoicePresentation(offered) ||
      !offerIsActive(offered) || isSubmitting || hasError ||
      selectionInFlight.current || destinationIds.length === 0) return;
    selectionInFlight.current = true;
    setSelectionPendingMessageId(messageId);
    setSelectionErrorMessageId(null);
    setSelectionNotice(null);
    try {
      const { tripState: selectedState, assistantMessage } =
        await selectDestinationRecommendation(tripId, messageId, destinationIds);
      setClosedOfferIds((current) => [...new Set([...current, messageId])]);
      onTripStateChange(selectedState);
      setMessages((current) => appendPersistedMessageIfAbsent(current, assistantMessage));
      setRevealing({ id: assistantMessage.id, visibleCharacters: 0 });
    } catch (error) {
      if (error instanceof DestinationSelectionFollowUpError) {
        setClosedOfferIds((current) => [...new Set([...current, messageId])]);
        onTripStateChange(error.tripState);
        setSelectionNotice("目的地已保存，但确认回复未完成。请刷新核对。");
      } else if (error instanceof DestinationOfferExpiredError) {
        setClosedOfferIds((current) => [...new Set([...current, messageId])]);
        setSelectionNotice("这组选项已过期。请刷新查看最新对话，或重新搜索目的地。");
      } else {
        setSelectionErrorMessageId(messageId);
      }
    } finally {
      selectionInFlight.current = false;
      setSelectionPendingMessageId(null);
    }
  }

  function handleChooseDestination(): void {
    closeCurrentOffer();
    onChooseDestination();
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
                  {destinationChoicePresentation(conversationMessage) ? (
                    <DestinationChoicesCard
                      active={offerIsActive(conversationMessage)}
                      areas={tripState.destination.state === "known" ? tripState.destination.areas : []}
                      presentation={destinationChoicePresentation(conversationMessage)!}
                      error={selectionErrorMessageId === conversationMessage.id}
                      onCommit={(destinationIds) => void handleRecommendationSelection(conversationMessage.id, destinationIds)}
                      pending={selectionPendingMessageId !== null || isSubmitting || hasError}
                    />
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
          {selectionNotice ? <p role="alert">{selectionNotice}</p> : null}
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

      <GeneratePlanAction
        onChooseDestination={handleChooseDestination}
        onRequest={closeCurrentOffer}
        tripId={tripId}
        tripState={tripState}
      />

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
          disabled={isSubmitting || hasError || selectionPendingMessageId !== null}
          id="workspace-message"
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={handleMessageKeyDown}
          placeholder="告诉 Meri 你的想法…"
          type="text"
          value={message}
        />
        <button
          aria-label="发送消息"
          disabled={isSubmitting || hasError || selectionPendingMessageId !== null || message.trim() === ""}
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
