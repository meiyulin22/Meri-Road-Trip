"use client";

import { CheckCircle2, LoaderCircle, Route } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition } from "react";

import { evaluateGeneratePlanReadiness, type GeneratePlanReadiness } from "@/domain/trip-state/planning-readiness";
import { parseExactDate } from "@/domain/trip-state/trip-dates";
import { destinationText, type TripState } from "@/domain/trip-state/trip-state";

import { useLocale, useMessages } from "@/components/i18n/locale-context";

import { requestPlanningHandoff, savePlanHandoff } from "./planning-handoff-model";
import { planningReadinessMessage } from "./planning-readiness-model";
import styles from "./trip-workspace.module.css";

const ready = {
  zh: { title: (where: string) => `可以开始规划了：${where}`, datesHint: "补上出发日期会有天气和每天的穿搭；不补也能先规划。" },
  en: { title: (where: string) => `Ready to plan: ${where}`, datesHint: "Add a start date for weather and what to wear each day, or plan now without it." },
} as const;

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
  waitingForSave,
}: {
  readonly onChooseDestination: () => void;
  readonly onRequest?: () => void;
  readonly tripId: string;
  readonly tripState: TripState;
  readonly waitingForSave: boolean;
}) {
  const text = useMessages().generatePlan;
  const locale = useLocale();
  const router = useRouter();
  const [isOpening, startOpening] = useTransition();
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

  const isPreparing = isChecking || isOpening;

  async function openPlan(): Promise<void> {
    if (requestInFlight.current || isOpening || waitingForSave || !blocked.canProceed) return;
    requestInFlight.current = true;
    setIsChecking(true);
    setAnswer(null);
    try {
      onRequest?.();
      const result = await requestPlanningHandoff(tripId);
      if (!result.canProceed) {
        setAnswer({ destinationKey, readiness: result });
        return;
      }
      savePlanHandoff(tripId, result.handoff);
      startOpening(() => router.push(`/trips/${encodeURIComponent(tripId)}/plan`));
    } catch {
      setAnswer({ destinationKey, readiness: null });
    } finally {
      requestInFlight.current = false;
      setIsChecking(false);
    }
  }

  const datesMissing = parseExactDate(tripState.startDate) === null;
  return (
    <div className={styles.chatGeneratePlan} data-region="chat-generate-plan" data-ready={blocked.canProceed ? "true" : undefined}>
      {/* Ready: say so plainly above the button (2026-11-22), and what adding dates would give. */}
      {blocked.canProceed ? (
        <div className={styles.generatePlanReady}>
          <p><CheckCircle2 aria-hidden="true" size={16} />{ready[locale].title(destinationText(tripState.destination) ?? "")}</p>
          {datesMissing ? <span>{ready[locale].datesHint}</span> : null}
        </div>
      ) : null}
      <div className={styles.generatePlanTrigger}>
        {/* aria-disabled rather than disabled keeps the button focusable, so keyboard
            users reach the explanation too. */}
        <button
          aria-busy={isPreparing}
          aria-describedby={blocked.canProceed ? undefined : hintId}
          aria-disabled={!blocked.canProceed || isPreparing || waitingForSave}
          aria-label={isPreparing ? text.checking : text.label}
          className={styles.haloButton}
          onClick={() => void openPlan()}
          type="button"
        >
          {isPreparing ? (
            <LoaderCircle aria-hidden="true" className={styles.loadingIcon} size={17} />
          ) : (
            <Route aria-hidden="true" size={17} />
          )}
          <HaloLabel text={isPreparing ? text.checkingShort : text.label} />
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
