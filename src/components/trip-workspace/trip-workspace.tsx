"use client";

import { Backpack, CloudSun, Compass, Home, Map, Menu, MountainSnow, Plus, X, type LucideIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import type { ConversationActivity } from "@/components/companion/companion-status-model";
import { MeriWorld } from "@/components/companion/meri-world";
import type { SelectedPlaceImage } from "@/capabilities/destination/place-images";
import type { TripMessage } from "@/domain/trip-message/trip-message";
import type { TripState } from "@/domain/trip-state/trip-state";

import { ConversationPanel } from "./conversation-panel";
import { ExpeditionBriefPanel } from "./expedition-brief-panel";
import { coverPhoto, requestDestinationPhotos } from "./destination-photos-model";
import { JourneyOrbit } from "./journey-orbit";
import { WorkspaceHeader } from "./workspace-header";
import { useMessages } from "@/components/i18n/locale-context";

import styles from "./trip-workspace.module.css";

const sidebarNavigation: Array<{
  key: "home" | "trips" | "explore" | "map" | "weather";
  icon: LucideIcon;
  href?: string;
}> = [
  { key: "home", icon: Home, href: "/" },
  { key: "trips", icon: Backpack },
  { key: "explore", icon: Compass },
  { key: "map", icon: Map },
  { key: "weather", icon: CloudSun },
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
  initialPlacePhotos,
  initialTripState,
  tripId,
}: {
  readonly initialMessages: readonly TripMessage[];
  /** null when the server did not have them in time; the browser asks instead. */
  readonly initialPlacePhotos: readonly SelectedPlaceImage[] | null;
  readonly initialTripState: TripState;
  readonly tripId: string;
}) {
  const [tripState, setTripState] = useState(initialTripState);
  const [placePhotos, setPlacePhotos] = useState(initialPlacePhotos);
  const destinationKey = JSON.stringify(tripState.destination);
  // The destination the photos on screen belong to; null until they are known.
  const photosFor = useRef<string | null>(initialPlacePhotos === null ? null : JSON.stringify(initialTripState.destination));

  useEffect(() => {
    if (photosFor.current === destinationKey) return;
    let current = true;
    requestDestinationPhotos(tripId)
      .then((photos) => {
        if (!current) return;
        photosFor.current = destinationKey;
        setPlacePhotos(photos);
      })
      // Photos only decorate the Journey; without them the globe stands alone.
      .catch(() => undefined);
    return () => { current = false; };
  }, [destinationKey, tripId]);
  const [conversationExpanded, setConversationExpanded] = useState(true);
  const [destinationEditorOpenRequest, setDestinationEditorOpenRequest] = useState(0);
  const [conversationActivity, setConversationActivity] = useState<ConversationActivity>("idle");
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
      <div className={styles.background} aria-hidden="true" />
      <div className={styles.workspaceApplication} data-region="workspace-content">
        <WorkspaceSidebar />
        <WorkspaceHeader cover={coverPhoto(placePhotos)} tripState={tripState} />
        <div className={styles.workspaceStage} data-region="workspace-stage">
          <ConversationPanel
            initialMessages={initialMessages}
            isExpanded={conversationExpanded}
            onActivityChange={setConversationActivity}
            onChooseDestination={() => setDestinationEditorOpenRequest((request) => request + 1)}
            onExpandedChange={setConversationExpanded}
            onTripStateChange={setTripState}
            tripId={tripId}
            tripState={tripState}
          />
          <div className={styles.briefColumn}>
            <ExpeditionBriefPanel
              destinationEditorOpenRequest={destinationEditorOpenRequest}
              onTripStateChange={setTripState}
              tripId={tripId}
              tripState={tripState}
            />
            <JourneyOrbit destination={tripState.destination} photos={placePhotos ?? []} />
            <MeriWorld activity={conversationActivity} tripState={tripState} />
          </div>
        </div>
      </div>
    </main>
  );
}

function WorkspaceSidebar() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const text = useMessages();

  return (
    <>
      <button
        aria-haspopup="dialog"
        aria-label={text.nav.open}
        className={styles.sidebarTrigger}
        onClick={() => dialogRef.current?.showModal()}
        type="button"
      >
        <Menu aria-hidden="true" size={19} />
      </button>
      <dialog
        aria-label={text.nav.label}
        className={styles.sidebar}
        data-region="sidebar"
        ref={dialogRef}
      >
        <button
          aria-label={text.nav.close}
          className={styles.sidebarClose}
          onClick={() => dialogRef.current?.close()}
          type="button"
        >
          <X aria-hidden="true" size={18} />
        </button>
        <Link aria-label={text.workspace.homeLabel} className={styles.sidebarBrand} href="/">
          <Image
            alt=""
            height={500}
            priority
            src="/brand/meri-lockup.svg"
            width={640}
          />
        </Link>
        <p className={styles.sidebarTagline}>Explore Further<br />With Meri</p>

        <Link className={styles.newJourneyLink} href="/">
          <Plus aria-hidden="true" size={17} />
          {text.nav.newJourney}
        </Link>

        <nav className={styles.sidebarNavigation} aria-label={text.nav.primary}>
          {sidebarNavigation.map(({ href, icon: Icon, key }) =>
            href ? (
              <Link href={href} key={key}>
                <Icon aria-hidden="true" size={18} />
                <span>{text.nav[key]}</span>
              </Link>
            ) : (
              <span aria-disabled="true" key={key}>
                <Icon aria-hidden="true" size={18} />
                <span>{text.nav[key]}</span>
                <small>{text.nav.soon}</small>
              </span>
            ),
          )}
        </nav>

        <p className={styles.sidebarMotto}>
          <MountainSnow aria-hidden="true" size={23} strokeWidth={1.5} />
          <span>Small steps.<br />A wider world.</span>
        </p>
      </dialog>
    </>
  );
}
