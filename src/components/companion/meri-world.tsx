"use client";

import type { TripState } from "@/domain/trip-state/trip-state";

import type { BearReaction } from "./bear-behavior";
import { CompanionBear } from "./companion-bear";
import { companionStatus, type ConversationActivity, type CompanionStatus } from "./companion-status-model";
import styles from "./companion.module.css";

/** What the bear reacts to: the same states its speech bubble speaks about. */
function bearReaction(status: CompanionStatus, tripState: TripState): BearReaction {
  if (status.mood === "error") return { kind: "error" };
  if (status.mood === "thinking") return { kind: "thinking" };
  // Any change to the Journey earns one more cheer once a plan can be made.
  if (status.mood === "ready") return { kind: "ready", key: JSON.stringify(tripState) };
  return null;
}

/**
 * Meri's bear at its camp table, kept in view at the foot of the Journey column. Its
 * line comes from companionStatus; what it does in between comes from bear-behavior,
 * played by CompanionBear (docs/product/companion-bear.md).
 */
export function MeriWorld({
  activity,
  tripState,
}: {
  readonly activity: ConversationActivity;
  readonly tripState: TripState;
}) {
  const status = companionStatus(tripState, activity);

  return (
    <section className={styles.meriWorld} aria-label="Meri companion" data-region="meri-world">
      <div className={styles.companionScene} data-mood={status.mood} data-region="companion-scene">
        {/* Keyed by the line, so each new message pops in instead of silently swapping. */}
        <p aria-live="polite" className={styles.companionBubble} key={status.text}>
          {status.text}
        </p>
        <CompanionBear reaction={bearReaction(status, tripState)} />
      </div>
    </section>
  );
}
