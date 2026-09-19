"use client";

import {
  ArrowLeft,
  Backpack,
  Binoculars,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleDollarSign,
  CloudSun,
  Compass,
  Home,
  Map,
  MoreHorizontal,
  MountainSnow,
  Plus,
  Route,
  Save,
  Send,
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";

import type {
  TripDraft,
  TripDraftField,
  TransportPreference,
} from "@/domain/trip-draft/trip-draft";
import { transportPreferences } from "@/domain/trip-draft/trip-draft";

import styles from "./trip-workspace.module.css";
import {
  applyTemporaryTripDraftEdit,
  clearTemporaryTripWorkspace,
  getTemporaryTripWorkspace,
  subscribeTemporaryTripWorkspace,
  type TripDraftFieldName,
} from "./temporary-trip-workspace-store";

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

const compactBriefFields: TripDraftFieldName[] = [
  "destination",
  "startDate",
  "duration",
];

const allBriefFields: Array<{
  readonly key: TripDraftFieldName;
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

export function TripWorkspace() {
  const hasLoaded = useSyncExternalStore(
    subscribeToStaticClientState,
    () => true,
    () => false,
  );
  const workspace = useSyncExternalStore(
    subscribeTemporaryTripWorkspace,
    getTemporaryTripWorkspace,
    () => null,
  );
  const layoutDebugEnabled = useSyncExternalStore(
    subscribeToStaticClientState,
    getLayoutDebugState,
    () => false,
  );

  if (!hasLoaded) {
    return <main className={styles.loading}>正在打开旅程空间…</main>;
  }

  if (workspace === null) {
    return <MissingTemporaryWorkspace />;
  }

  const title = getWorkspaceTitle(workspace.draft);

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
            onClick={clearTemporaryTripWorkspace}
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
              <span>未保存</span>
            </div>
            <button disabled type="button">
              <Save aria-hidden="true" size={16} />
              保存旅程
            </button>
            <button aria-label="更多旅程操作（暂不可用）" disabled type="button">
              <MoreHorizontal aria-hidden="true" size={17} />
            </button>
          </div>
        </header>

        <div className={styles.workspaceStage} data-region="workspace-stage">
          <ExpeditionBrief draft={workspace.draft} />
          <MeriWorld draft={workspace.draft} />
          <ConversationDock
            draft={workspace.draft}
            initialMessage={workspace.initialMessage}
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
        onClick={clearTemporaryTripWorkspace}
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
        onClick={clearTemporaryTripWorkspace}
      >
        <Plus aria-hidden="true" size={17} />
        新旅程
      </Link>

      <nav className={styles.sidebarNavigation} aria-label="Primary navigation">
        {sidebarNavigation.map(({ href, icon: Icon, label }) =>
          href ? (
            <Link href={href} key={label} onClick={clearTemporaryTripWorkspace}>
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

function MissingTemporaryWorkspace() {
  return (
    <main className={styles.missingWorkspace}>
      <Image
        alt="Meri"
        height={329}
        src="/brand/meri-wordmark.svg"
        width={1101}
      />
      <p>这个临时旅程空间已经结束。回到首页，从一个新想法开始吧。</p>
      <Link href="/">回到首页</Link>
    </main>
  );
}

function ExpeditionBrief({ draft }: { readonly draft: TripDraft }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [editing, setEditing] = useState<{
    readonly field: TripDraftFieldName;
    readonly value: string;
  } | null>(null);
  const visibleFields = isExpanded
    ? allBriefFields
    : allBriefFields.filter(({ key }) => compactBriefFields.includes(key));

  function startEditing(field: TripDraftFieldName): void {
    const currentField = draft[field];
    setEditing({
      field,
      value: currentField.state === "missing" ? "" : currentField.value,
    });
  }

  function confirmEditing(): void {
    if (editing === null) {
      return;
    }

    applyTemporaryTripDraftEdit({
      type: "confirm",
      field: editing.field,
      value: editing.value,
    });
    setEditing(null);
  }

  function cancelEditing(): void {
    applyTemporaryTripDraftEdit({ type: "cancel" });
    setEditing(null);
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
          <h2 id="expedition-brief-title">{getWorkspaceTitle(draft)}</h2>
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

      <p className={styles.attentionSummary}>旅程还在构思中</p>

      <dl className={styles.briefFields}>
        {visibleFields.map(({ key, label }) => (
          <ExpeditionBriefField
            editValue={editing?.field === key ? editing.value : ""}
            field={draft[key]}
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
  readonly field: TripDraftField;
  readonly fieldName: TripDraftFieldName;
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
            <ChevronRight aria-hidden="true" size={14} />
          </button>
        )}
      </dd>
    </div>
  );
}

function MeriWorld({ draft }: { readonly draft: TripDraft }) {
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
          <p>{getCompanionMessage(draft)}</p>
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
  draft,
  initialMessage,
}: {
  readonly draft: TripDraft;
  readonly initialMessage: string;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

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
        <div className={styles.messageHistory}>
          <article className={styles.meriMessage}>
            <Image
              alt=""
              height={84}
              src="/companion/idle/south.png"
              width={84}
            />
            <div>
              <span>Meri</span>
              <p>{getConversationOpening(draft)}</p>
            </div>
          </article>
          <article className={styles.userMessage}>
            <span>你从这里开始</span>
            <p>{initialMessage}</p>
          </article>
          <p className={styles.conversationHint}>
            旅程不需要一次想完整，我们可以边聊边整理。
          </p>
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
            <p>{getConversationOpening(draft)}</p>
          </div>
        </article>
      )}

      <div
        aria-describedby="conversation-prototype-note"
        className={styles.conversationComposer}
        data-region="conversation-composer"
      >
        <button aria-label="添加内容（下一步开放）" disabled type="button">
          <Plus aria-hidden="true" size={18} />
        </button>
        <label className={styles.srOnly} htmlFor="workspace-message">
          告诉 Meri 你还在想什么
        </label>
        <input
          id="workspace-message"
          placeholder="告诉 Meri 你还在想什么..."
          readOnly
          type="text"
        />
        <span id="conversation-prototype-note">下一步开放</span>
        <button aria-label="发送（下一步开放）" disabled type="button">
          <Send aria-hidden="true" size={18} />
        </button>
      </div>
    </section>
  );
}

function getWorkspaceTitle(draft: TripDraft): string {
  if (draft.name.state !== "missing") {
    return draft.name.value;
  }

  if (draft.destination.state !== "missing") {
    return `${draft.destination.value}之旅`;
  }

  return "新的旅程想法";
}

function getCompanionMessage(draft: TripDraft): string {
  if (draft.destination.state === "ambiguous") {
    return "两个方向都很有吸引力，我可以先帮你比较一下。";
  }

  if (draft.destination.state === "missing") {
    return "还没决定去哪也没关系，我们可以一起找方向。";
  }

  return `去${draft.destination.value}是个很棒的开始，我们继续把旅程补完整吧。`;
}

function getConversationOpening(draft: TripDraft): string {
  if (draft.startDate.state !== "missing") {
    return `我已经记下了你的想法，也保留了“${draft.startDate.value}”这个时间范围。你可以继续告诉我任何还在考虑的事情。`;
  }

  return "我已经记下了你的旅行想法。信息不需要一次完整，我们可以边聊边把旅程变清晰。";
}
