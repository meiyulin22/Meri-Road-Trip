"use client";

import type { TripState } from "@/domain/trip-state/trip-state";
import { useMessages } from "@/components/i18n/locale-context";

import { companionStatus, type ConversationActivity } from "./companion-status-model";
import { WorkspaceRedPanda } from "./workspace-red-panda";
import styles from "./companion.module.css";

/** The decorative character and its independently updated status bubble. */
export function MeriWorld({
  activity,
  tripState,
}: {
  readonly activity: ConversationActivity;
  readonly tripState: TripState;
}) {
  const status = companionStatus(tripState, activity, useMessages().bear);

  return (
    <section className={styles.meriWorld} aria-label="Meri companion" data-region="meri-world">
      <div className={styles.companionScene} data-mood={status.mood} data-region="companion-scene">
        {/* Keyed by the line, so each new message pops in instead of silently swapping. */}
        <p aria-live="polite" className={styles.companionBubble} key={status.text}>
          {status.text}
        </p>
        <WorkspaceRedPanda />
      </div>
    </section>
  );
}
