"use client";

import { Backpack, CloudSun, Compass, Home, Map, MountainSnow, Plus, type LucideIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";

import type { TripMessage } from "@/domain/trip-message/trip-message";
import type { TripState } from "@/domain/trip-state/trip-state";

import { ConversationPanel } from "./conversation-panel";
import { ExpeditionBriefPanel } from "./expedition-brief-panel";
import { MeriWorld } from "./meri-world";
import { WorkspaceHeader } from "./workspace-header";
import styles from "./trip-workspace.module.css";

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
        <WorkspaceHeader tripState={tripState} />
        <div className={styles.workspaceStage} data-region="workspace-stage">
          <ConversationPanel
            initialMessages={initialMessages}
            onTripStateChange={setTripState}
            tripId={tripId}
            tripState={tripState}
          />
          <ExpeditionBriefPanel
            onTripStateChange={setTripState}
            tripId={tripId}
            tripState={tripState}
          />
          <MeriWorld />
          <GeneratePlanAction />
          <PlanningPanel />
        </div>
      </div>
    </main>
  );
}

// These slots have no UI or behavior until a later planning step defines them.
function GeneratePlanAction() { return null; }
function PlanningPanel() { return null; }

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
