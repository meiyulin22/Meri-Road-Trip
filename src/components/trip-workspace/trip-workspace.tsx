"use client";

import {
  ArrowLeft,
  Backpack,
  Binoculars,
  ChevronDown,
  ChevronUp,
  CircleDollarSign,
  CloudSun,
  Compass,
  Home,
  LoaderCircle,
  Map,
  MoreHorizontal,
  MountainSnow,
  Pencil,
  Plus,
  Route,
  Save,
  Send,
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import type { TripMessage } from "@/domain/trip-message/trip-message";
import {
  transportPreferences,
  type TransportPreference,
} from "@/domain/trip-draft/trip-draft";
import type {
  TripState,
  TripStateField,
  TripStateFieldName,
} from "@/domain/trip-state/trip-state";

import styles from "./trip-workspace.module.css";
import { nextRevealCharacterCount, visibleAssistantText } from "./conversation-reveal";
import {
  createDirectTripStatePatch,
  requestTripStateUpdate,
} from "./trip-state-persistence-model";
import { toWorkspaceUIMessages } from "./trip-message-ui-adapter";
import {
  reconcileCommittedUserId,
  WorkspaceChatTransport,
  type CommittedWorkspaceTurn,
} from "./workspace-chat-transport";

const certaintyLabels = {
  known: "已理解",
  approximate: "大致范围",
  missing: "暂未确定",
  ambiguous: "需要确认",
} as const;

const transportPreferenceLabels: Record<TransportPreference, string> = {
  self_drive: "自驾",
  no_self_drive: "不自驾",
  public_transport: "公共交通",
  flexible: "交通方式灵活",
};

const compactBriefFields: TripStateFieldName[] = [
  "destination",
  "startDate",
  "duration",
];

const allBriefFields: Array<{
  readonly key: TripStateFieldName;
  readonly label: string;
}> = [
  { key: "name", label: "旅程名称" },
  { key: "origin", label: "出发地" },
  { key: "destination", label: "目的地" },
  { key: "startDate", label: "开始时间" },
  { key: "endDate", label: "结束时间" },
  { key: "duration", label: "行程时长" },
  { key: "transportPreference", label: "交通偏好" },
];

const contextualActions = [
  { icon: Binoculars, label: "比较雪况" },
  { icon: Route, label: "交通方案" },
  { icon: CircleDollarSign, label: "看看预算" },
];

const workspaceConversationError =
  "发送结果暂时无法确认。请刷新旅程，查看最新消息和状态后再继续。";

const sidebarNavigation: Array<{
  label: string;
  icon: LucideIcon;
  href?: string;
}> = [
  { label: "Home", icon: Home, href: "/" },
  { label: "Trips", icon: Backpack },
  { label: "Explore", icon: Compass },
  { label: "Map", icon: Map },
  { label: "Weather", icon: CloudSun },
];

function subscribeToStaticClientState(): () => void {
  return () => undefined;
}

function getLayoutDebugState(): boolean {
  return (
    process.env.NODE_ENV === "development" &&
    new URLSearchParams(window.location.search).has("layoutDebug")
  );
}

export function TripWorkspace({
  initialMessages,
  initialTripState,
  tripId,
}: {
  readonly initialMessages: readonly TripMessage[];
  readonly initialTripState: TripState;
  readonly tripId: string;
}) {
  const [tripState, setTripState] = useState(initialTripState);
  const layoutDebugEnabled = useSyncExternalStore(
    subscribeToStaticClientState,
    getLayoutDebugState,
    () => false,
  );

  const title = getWorkspaceTitle(tripState);

  return (
    <main
      className={styles.workspace}
      data-layout-debug={layoutDebugEnabled ? "true" : "false"}
    >
      <div className={styles.background} aria-hidden="true">
        <Image
          alt=""
          className={styles.backgroundImage}
          height={941}
          priority
          src="/backgrounds/trip-workspace-desktop.png"
          unoptimized
          width={1672}
        />
      </div>
      <WorkspaceSidebar />

      <div className={styles.workspaceApplication} data-region="workspace-content">
        <header className={styles.header} data-region="header">
          <Link
            className={styles.homeLink}
            href="/"
          >
            <ArrowLeft aria-hidden="true" size={17} />
            <span>回到首页</span>
          </Link>

          <div className={styles.headerTitle}>
            <span>TRIP WORKSPACE</span>
            <h1>{title}</h1>
          </div>

          <div className={styles.journeyControl} aria-label="Journey control">
            <div className={styles.saveState}>
              <span>IDEA</span>
              <span>已保存</span>
            </div>
            <button disabled type="button">
              <Save aria-hidden="true" size={16} />
              已保存
            </button>
            <button aria-label="更多旅程操作（暂不可用）" disabled type="button">
              <MoreHorizontal aria-hidden="true" size={17} />
            </button>
          </div>
        </header>

        <div className={styles.workspaceStage} data-region="workspace-stage">
          <ExpeditionBrief
            onTripStateChange={setTripState}
            tripId={tripId}
            tripState={tripState}
          />
          <MeriWorld />
          <ConversationDock
            initialMessages={initialMessages}
            onTripStateChange={setTripState}
            tripId={tripId}
            tripState={tripState}
          />
        </div>
      </div>
    </main>
  );
}

function WorkspaceSidebar() {
  return (
    <aside className={styles.sidebar} aria-label="Meri sidebar" data-region="sidebar">
      <Link
        aria-label="Meri home"
        className={styles.sidebarBrand}
        href="/"
      >
        <Image
          alt=""
          height={500}
          priority
          src="/brand/meri-lockup.svg"
          width={640}
        />
      </Link>
      <p className={styles.sidebarTagline}>Explore Further<br />With Meri</p>

      <Link
        className={styles.newJourneyLink}
        href="/"
      >
        <Plus aria-hidden="true" size={17} />
        新旅程
      </Link>

      <nav className={styles.sidebarNavigation} aria-label="Primary navigation">
        {sidebarNavigation.map(({ href, icon: Icon, label }) =>
          href ? (
            <Link href={href} key={label}>
              <Icon aria-hidden="true" size={18} />
              <span>{label}</span>
            </Link>
          ) : (
            <span aria-disabled="true" key={label}>
              <Icon aria-hidden="true" size={18} />
              <span>{label}</span>
              <small>Soon</small>
            </span>
          ),
        )}
      </nav>

      <p className={styles.sidebarMotto}>
        <MountainSnow aria-hidden="true" size={23} strokeWidth={1.5} />
        <span>Small steps.<br />A wider world.</span>
      </p>
    </aside>
  );
}

function ExpeditionBrief({
  onTripStateChange,
  tripId,
  tripState,
}: {
  readonly onTripStateChange: (state: TripState) => void;
  readonly tripId: string;
  readonly tripState: TripState;
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [persistenceError, setPersistenceError] = useState<string | null>(null);
  const isPersistingEdit = useRef(false);
  const [editing, setEditing] = useState<{
    readonly field: TripStateFieldName;
    readonly value: string;
  } | null>(null);
  const visibleFields = isExpanded
    ? allBriefFields
    : allBriefFields.filter(({ key }) => compactBriefFields.includes(key));

  function startEditing(field: TripStateFieldName): void {
    const currentField = tripState[field];
    setEditing({
      field,
      value: currentField.state === "missing" ? "" : currentField.value,
    });
  }

  async function confirmEditing(): Promise<void> {
    if (editing === null || isPersistingEdit.current) {
      return;
    }

    isPersistingEdit.current = true;
    try {
      const patch = createDirectTripStatePatch(
        tripState,
        editing.field,
        editing.value,
      );
      const persistedState = await requestTripStateUpdate(tripId, patch);
      onTripStateChange(persistedState);
      setPersistenceError(null);
      setEditing(null);
    } catch {
      setPersistenceError("这次修改暂时没能保存，请重试。");
    } finally {
      isPersistingEdit.current = false;
    }
  }

  function cancelEditing(): void {
    setEditing(null);
    setPersistenceError(null);
  }

  return (
    <aside
      aria-labelledby="expedition-brief-title"
      className={`${styles.glassPanel} ${styles.expeditionBrief}`}
      data-expanded={isExpanded ? "true" : "false"}
      data-region="expedition-brief"
    >
      <header className={styles.briefHeader}>
        <div className={styles.regionHeading}>
          <p>EXPEDITION BRIEF</p>
          <h2 id="expedition-brief-title">{getWorkspaceTitle(tripState)}</h2>
        </div>
        <button
          aria-expanded={isExpanded}
          aria-label={isExpanded ? "收起旅程信息" : "查看全部旅程信息"}
          onClick={() => {
            setEditing(null);
            setIsExpanded((current) => !current);
          }}
          type="button"
        >
          <span>{isExpanded ? "收起" : "查看全部信息"}</span>
          {isExpanded ? (
            <ChevronUp aria-hidden="true" size={14} />
          ) : (
            <ChevronDown aria-hidden="true" size={14} />
          )}
        </button>
      </header>

      <div className={styles.briefGuidance}>
        <p className={styles.attentionSummary}>旅程还在构思中</p>
        <p className={styles.editingHint}>
          这是 Meri 目前理解的旅程，点击任意信息即可修改
        </p>
      </div>

      {persistenceError ? (
        <p className={styles.briefPersistenceError} role="alert">
          {persistenceError}
        </p>
      ) : null}

      <dl className={styles.briefFields}>
        {visibleFields.map(({ key, label }) => (
          <ExpeditionBriefField
            editValue={editing?.field === key ? editing.value : ""}
            field={tripState[key]}
            fieldName={key}
            isEditing={editing?.field === key}
            key={key}
            label={label}
            onCancel={cancelEditing}
            onChange={(value) => setEditing({ field: key, value })}
            onConfirm={confirmEditing}
            onEdit={() => startEditing(key)}
          />
        ))}
      </dl>
    </aside>
  );
}

interface ExpeditionBriefFieldProps {
  readonly label: string;
  readonly field: TripStateField;
  readonly fieldName: TripStateFieldName;
  readonly isEditing: boolean;
  readonly editValue: string;
  readonly onEdit: () => void;
  readonly onChange: (value: string) => void;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

function ExpeditionBriefField({
  label,
  field,
  fieldName,
  isEditing,
  editValue,
  onEdit,
  onChange,
  onConfirm,
  onCancel,
}: ExpeditionBriefFieldProps) {
  const value =
    field.state === "missing"
      ? "—"
      : fieldName === "transportPreference" &&
          field.state === "known" &&
          transportPreferences.includes(field.value as TransportPreference)
        ? transportPreferenceLabels[field.value as TransportPreference]
        : field.value;

  function handleKeyDown(event: React.KeyboardEvent<HTMLElement>): void {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    }

    if (event.key === "Enter") {
      event.preventDefault();
      onConfirm();
    }
  }

  return (
    <div className={styles.stateField} data-certainty={field.state}>
      <dt>
        <span>{label}</span>
        <span>{certaintyLabels[field.state]}</span>
      </dt>
      <dd>
        {isEditing ? (
          fieldName === "transportPreference" ? (
            <select
              aria-label={`编辑${label}`}
              autoFocus
              onBlur={onConfirm}
              onChange={(event) => onChange(event.target.value)}
              onKeyDown={handleKeyDown}
              value={editValue}
            >
              <option value="">暂未确定</option>
              {transportPreferences.map((preference) => (
                <option key={preference} value={preference}>
                  {transportPreferenceLabels[preference]}
                </option>
              ))}
            </select>
          ) : (
            <input
              aria-label={`编辑${label}`}
              autoFocus
              onBlur={onConfirm}
              onChange={(event) => onChange(event.target.value)}
              onKeyDown={handleKeyDown}
              type="text"
              value={editValue}
            />
          )
        ) : (
          <button aria-label={`编辑${label}`} onClick={onEdit} type="button">
            <span>{value}</span>
            <Pencil aria-hidden="true" size={13} />
          </button>
        )}
      </dd>
    </div>
  );
}

function MeriWorld() {
  return (
    <section
      aria-labelledby="meri-world-title"
      className={styles.meriWorld}
      data-region="meri-world"
    >
      <div className={styles.worldHeading}>
        <p>MERI BASE CAMP</p>
        <h2 className={styles.srOnly} id="meri-world-title">旅程正在展开</h2>
      </div>

      <div
        aria-label="Meri companion and conversation shortcuts"
        className={styles.companionScene}
        data-region="companion-scene"
      >
        <Image
          alt="Meri companion"
          className={styles.companion}
          height={84}
          priority
          src="/companion/idle/south.png"
          width={84}
        />
        <div className={styles.companionPrompt}>
          <p>我把目前理解的旅程整理在左上角了，哪里不对，直接点一下就能改。</p>
          <div aria-label="Conversation shortcuts" className={styles.contextualActions}>
            {contextualActions.map(({ icon: Icon, label }) => (
              <button disabled key={label} type="button">
                <Icon aria-hidden="true" size={14} />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function ConversationDock({
  initialMessages,
  onTripStateChange,
  tripId,
  tripState,
}: {
  readonly initialMessages: readonly TripMessage[];
  readonly onTripStateChange: (state: TripState) => void;
  readonly tripId: string;
  readonly tripState: TripState;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [message, setMessage] = useState("");
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
    setIsExpanded(true);
    setMessage("");
    void sendMessage({ text: submittedMessage });
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
      className={`${styles.glassPanel} ${styles.conversationDock}`}
      data-expanded={isExpanded ? "true" : "false"}
      data-region="conversation-dock"
    >
      <header className={styles.dockHeader}>
        <div className={styles.regionHeading}>
          <p>CONVERSATION</p>
          <h2 id="conversation-title">继续和 Meri 聊聊</h2>
        </div>
        <button
          aria-expanded={isExpanded}
          aria-label={isExpanded ? "收起对话" : "展开对话"}
          className={styles.dockToggle}
          onClick={() => setIsExpanded((current) => !current)}
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
          <article className={styles.meriMessage}>
            <Image
              alt=""
              height={84}
              src="/companion/idle/south.png"
              width={84}
            />
            <div>
              <span>Meri</span>
              <p>{getConversationOpening(tripState)}</p>
            </div>
          </article>
          <p className={styles.conversationHint}>
            旅程不需要一次想完整，我们可以边聊边整理。
          </p>
          {messages.map((conversationMessage, index) =>
            conversationMessage.role === "assistant" ? (
              <article className={styles.meriMessage} key={conversationMessage.id}>
                <Image
                  alt=""
                  height={84}
                  src="/companion/idle/south.png"
                  width={84}
                />
                <div>
                  <span>Meri</span>
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
                </div>
              </article>
            ) : (
              <article className={styles.userMessage} key={conversationMessage.id}>
                <span>你</span>
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
      ) : (
        <article className={styles.meriMessage}>
          <Image
            alt=""
            height={84}
            src="/companion/idle/south.png"
            width={84}
          />
          <div>
            <span>Meri</span>
            <p>{getConversationOpening(tripState)}</p>
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
          <Plus aria-hidden="true" size={18} />
        </button>
        <label className={styles.srOnly} htmlFor="workspace-message">
          告诉 Meri 你还在想什么
        </label>
        <input
          disabled={isSubmitting || hasError}
          id="workspace-message"
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={handleMessageKeyDown}
          placeholder="告诉 Meri 你还在想什么..."
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
            <Send aria-hidden="true" size={18} />
          )}
        </button>
      </form>
    </section>
  );
}

function getWorkspaceTitle(tripState: TripState): string {
  if (tripState.name.state !== "missing") {
    return tripState.name.value;
  }

  if (tripState.destination.state !== "missing") {
    return `${tripState.destination.value}之旅`;
  }

  return "新的旅程想法";
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
