"use client";

import { LoaderCircle, Route } from "lucide-react";
import { useId, useRef, useState } from "react";

import { evaluateGeneratePlanReadiness, type GeneratePlanReadiness } from "@/domain/trip-state/planning-readiness";
import type { TripState } from "@/domain/trip-state/trip-state";

import { useMessages } from "@/components/i18n/locale-context";

import { planningReadinessMessage, requestPlanningReadiness } from "./planning-readiness-model";
import styles from "./trip-workspace.module.css";

/**
 * The one Generate plan, under the conversation where Meri says a plan can be made.
 * It is always visible so the user knows it exists. Until a destination is saved it
 * stays unavailable and, on hover or focus, explains the ways to add one.
 */
export function GeneratePlanAction({
  tripId,
  tripState,
  onChooseDestination,
  onRequest,
}: {
  readonly onChooseDestination: () => void;
  readonly onRequest?: () => void;
  readonly tripId: string;
  readonly tripState: TripState;
}) {
  const text = useMessages().generatePlan;
  // The answer belongs to the destination it was asked about, so a destination that
  // changes afterwards drops it instead of describing the old one.
  const [answer, setAnswer] = useState<{
    readonly destinationKey: string;
    readonly readiness: GeneratePlanReadiness | null;
  } | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const requestInFlight = useRef(false);
  const hintId = useId();
  const destinationKey = JSON.stringify(tripState.destination);
  const current = answer?.destinationKey === destinationKey ? answer : null;
  const blocked = evaluateGeneratePlanReadiness(tripState);

  async function checkReadiness(): Promise<void> {
    if (requestInFlight.current || !blocked.canProceed) return;
    requestInFlight.current = true;
    onRequest?.();
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

  return (
    <div className={styles.chatGeneratePlan} data-region="chat-generate-plan">
      <div className={styles.generatePlanTrigger}>
        {/* aria-disabled rather than disabled keeps the button focusable, so keyboard
            users reach the explanation too. */}
        <button
          aria-busy={isChecking}
          aria-describedby={blocked.canProceed ? undefined : hintId}
          aria-disabled={!blocked.canProceed || isChecking}
          aria-label={isChecking ? text.checking : text.label}
          className={styles.haloButton}
          onClick={() => void checkReadiness()}
          type="button"
        >
          {isChecking ? (
            <LoaderCircle aria-hidden="true" className={styles.loadingIcon} size={17} />
          ) : (
            <Route aria-hidden="true" size={17} />
          )}
          <HaloLabel text={isChecking ? text.checkingShort : text.label} />
        </button>
        {blocked.canProceed ? null : (
          <div className={styles.generatePlanHint} id={hintId} role="note">
            {blocked.reason === "destination_missing" ? (
              <>
                <strong>{text.missingTitle}</strong>
                <ul>
                  <li>{text.missingSay}</li>
                  <li>{text.missingRecommend}</li>
                  <li>
                    <button onClick={onChooseDestination} type="button">{text.missingSearch}</button>
                  </li>
                </ul>
              </>
            ) : (
              <>
                <strong>{text.unverifiedTitle}</strong>
                <ul>
                  <li>
                    <button onClick={onChooseDestination} type="button">{text.unverifiedSearch}</button>
                  </li>
                </ul>
              </>
            )}
          </div>
        )}
      </div>
      {current?.readiness ? (
        <p role="status" data-ready={current.readiness.canProceed}>
          {planningReadinessMessage(current.readiness, text)}
        </p>
      ) : null}
      {current !== null && current.readiness === null ? (
        <p role="alert" data-ready="false">{text.checkFailed}</p>
      ) : null}
    </div>
  );
}

/** The label split into letters so each can lift in turn on hover; the button's
 * aria-label carries the words for assistive technology. */
function HaloLabel({ text }: { readonly text: string }) {
  return (
    <span aria-hidden="true" className={styles.haloLabel}>
      {Array.from(text).map((character, index) => (
        <span key={index} style={{ "--i": index } as React.CSSProperties}>{character}</span>
      ))}
    </span>
  );
}
