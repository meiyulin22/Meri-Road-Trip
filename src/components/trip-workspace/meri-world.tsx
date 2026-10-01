import Image from "next/image";

import type { TripState } from "@/domain/trip-state/trip-state";

import { companionStatus, type ConversationActivity } from "./companion-status-model";
import styles from "./trip-workspace.module.css";

/**
 * Meri's bear, kept in view at the foot of the Journey column, saying one line about
 * what happens next. Its mood drives a small CSS motion on the existing pixel art —
 * breathing, a sway while thinking, a hop when a plan can be made, a shake on errors —
 * until drawn sprite frames replace it.
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
        <Image
          alt="Meri 正在查看地图"
          className={styles.companion}
          height={256}
          key={status.mood}
          src="/companion/home-v2-companion.png"
          width={384}
        />
      </div>
    </section>
  );
}
