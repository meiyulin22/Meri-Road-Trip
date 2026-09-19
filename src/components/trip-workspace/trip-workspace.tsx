"use client";

import {
  ArrowLeft,
  ArrowUp,
  Backpack,
  Binoculars,
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
import { useSyncExternalStore } from "react";

import type {
  TransportPreference,
  TripDraft,
  TripDraftField,
} from "@/domain/trip-draft/trip-draft";

import styles from "./trip-workspace.module.css";
import {
  clearTemporaryTripWorkspace,
  getTemporaryTripWorkspace,
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

const signposts = [
  { icon: Binoculars, label: "比较两个目的地" },
  { icon: CircleDollarSign, label: "看看旅行预算" },
  { icon: Route, label: "找找交通方案" },
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
    subscribeToStaticClientState,
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
          data-background-coordinate-system
          height={1024}
          priority
          src="/backgrounds/trip-workspace-desktop.png"
          width={1536}
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

        <div className={styles.workspaceLayout}>
          <JourneyState draft={workspace.draft} />

          <div className={styles.workspaceMain}>
            <MeriWorld draft={workspace.draft} />
            <Conversation
              draft={workspace.draft}
              initialMessage={workspace.initialMessage}
            />
          </div>
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

function JourneyState({ draft }: { readonly draft: TripDraft }) {
  const fields: Array<{
    label: string;
    field: TripDraftField;
    formatKnownValue?: (value: string) => string;
  }> = [
    { label: "目的地", field: draft.destination },
    { label: "出发时间", field: draft.startDate },
    { label: "结束时间", field: draft.endDate },
    { label: "行程时长", field: draft.duration },
    { label: "出发地", field: draft.origin },
    {
      label: "交通偏好",
      field: draft.transportPreference,
      formatKnownValue: (value) =>
        transportPreferenceLabels[value as TransportPreference],
    },
  ];

  return (
    <aside
      aria-labelledby="journey-state-title"
      className={`${styles.glassPanel} ${styles.journeyState}`}
      data-region="journey-state"
    >
      <div className={styles.regionHeading}>
        <p>JOURNEY STATE</p>
        <h2 id="journey-state-title">{getWorkspaceTitle(draft)}</h2>
      </div>

      <p className={styles.journeySummary}>{getJourneySummary(draft)}</p>

      <dl className={styles.stateFields}>
        {fields.map(({ label, field, formatKnownValue }) => (
          <JourneyStateField
            field={field}
            formatKnownValue={formatKnownValue}
            key={label}
            label={label}
          />
        ))}
      </dl>
    </aside>
  );
}

interface JourneyStateFieldProps {
  readonly label: string;
  readonly field: TripDraftField;
  readonly formatKnownValue?: (value: string) => string;
}

function JourneyStateField({
  label,
  field,
  formatKnownValue = (value) => value,
}: JourneyStateFieldProps) {
  const value =
    field.state === "missing"
      ? "—"
      : field.state === "known"
        ? formatKnownValue(field.value)
        : field.value;

  return (
    <div className={styles.stateField} data-certainty={field.state}>
      <dt>
        <span>{label}</span>
        <span>{certaintyLabels[field.state]}</span>
      </dt>
      <dd>{value}</dd>
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
        <p>MERI WORLD</p>
        <h2 className={styles.srOnly} id="meri-world-title">旅程正在展开</h2>
      </div>

      <div
        aria-label="Future contextual signpost safe zone"
        className={styles.signpostSafeZone}
        data-region="signpost-safe-zone"
      >
        <div className={styles.signposts}>
          {signposts.map(({ icon: Icon, label }) => (
            <button
              aria-disabled="true"
              className={styles.signpost}
              data-intent={label}
              key={label}
              type="button"
            >
              <Icon aria-hidden="true" size={18} />
              <span>{label}</span>
              <ArrowUp aria-hidden="true" size={15} />
            </button>
          ))}
        </div>
      </div>

      <div
        aria-label="Companion safe zone"
        className={styles.companionSafeZone}
        data-region="companion-safe-zone"
      >
        <Image
          alt="Meri companion"
          className={styles.companion}
          height={84}
          priority
          src="/companion/idle/south.png"
          width={84}
        />
        <p>{getCompanionMessage(draft)}</p>
      </div>
    </section>
  );
}

function Conversation({
  draft,
  initialMessage,
}: {
  readonly draft: TripDraft;
  readonly initialMessage: string;
}) {
  return (
    <section
      aria-labelledby="conversation-title"
      className={`${styles.glassPanel} ${styles.conversation}`}
      data-region="conversation"
    >
      <div className={styles.regionHeading}>
        <p>CONVERSATION</p>
        <h2 id="conversation-title">继续和 Meri 聊聊</h2>
      </div>

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
          接下来的版本中，你可以继续补充想法，不需要先完成一份表单。
        </p>
      </div>

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

function getJourneySummary(draft: TripDraft): string {
  const details = [draft.startDate, draft.destination, draft.duration]
    .filter((field) => field.state !== "missing")
    .map((field) => field.value);

  return details.length > 0 ? details.join(" · ") : "旅程从一个想法开始";
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
