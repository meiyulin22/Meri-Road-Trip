"use client";

import { LoaderCircle, Route } from "lucide-react";
import { useRef, useState } from "react";

import type { GeneratePlanReadiness } from "@/domain/trip-state/planning-readiness";
import type { TripState } from "@/domain/trip-state/trip-state";

import { canRequestPlanGeneration, planningReadinessMessage, requestPlanningReadiness } from "./planning-readiness-model";
import styles from "./trip-workspace.module.css";

/**
 * Generate plan belongs where the user just finished choosing. Journey overview is
 * on the right and is the panel a user collapses; the conversation is where Meri
 * says the plan can be generated, so the button that acts on that sentence sits
 * with it, and answers there too.
 *
 * It keeps its own check rather than sharing Journey overview's: both ask the same
 * endpoint, and an answer shown where the click happened is the whole point.
 */
export function GeneratePlanAction({
  tripId,
  tripState,
}: {
  readonly tripId: string;
  readonly tripState: TripState;
}) {
  // The answer belongs to the destination it was asked about, so a destination that
  // changes afterwards drops it instead of describing the old one.
  const [answer, setAnswer] = useState<{
    readonly destinationKey: string;
    readonly readiness: GeneratePlanReadiness | null;
  } | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const requestInFlight = useRef(false);
  const destinationKey = JSON.stringify(tripState.destination);
  const current = answer?.destinationKey === destinationKey ? answer : null;

  async function checkReadiness(): Promise<void> {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setIsChecking(true);
    setAnswer(null);
    try {
      setAnswer({ destinationKey, readiness: await requestPlanningReadiness(tripId) });
    } catch {
      setAnswer({ destinationKey, readiness: null });
    } finally {
      requestInFlight.current = false;
      setIsChecking(false);
    }
  }

  if (!canRequestPlanGeneration(tripState)) return null;

  return (
    <div className={styles.chatGeneratePlan} data-region="chat-generate-plan">
      <button
        aria-busy={isChecking}
        disabled={isChecking}
        onClick={() => void checkReadiness()}
        type="button"
      >
        {isChecking ? (
          <LoaderCircle aria-hidden="true" className={styles.loadingIcon} size={17} />
        ) : (
          <Route aria-hidden="true" size={17} />
        )}
        <span>{isChecking ? "正在检查目的地…" : "Generate plan"}</span>
      </button>
      {current?.readiness ? (
        <p role="status" data-ready={current.readiness.canProceed}>
          {planningReadinessMessage(current.readiness)}
        </p>
      ) : null}
      {current !== null && current.readiness === null ? (
        <p role="alert" data-ready="false">暂时无法完成检查，请重试。</p>
      ) : null}
    </div>
  );
}
