"use client";

import { ArrowLeft, Lock } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useMemo, useSyncExternalStore } from "react";

import { useLocale, useMessages } from "@/components/i18n/locale-context";
import type { Messages } from "@/components/i18n/messages";
import { readPlanHandoff } from "@/components/trip-workspace/planning-handoff-model";
import { toCalendarDate } from "@/components/trip-workspace/trip-dates-model";
import { parseExactDays } from "@/domain/trip-state/trip-dates";
import { destinationText, type TripState, type TripStateField } from "@/domain/trip-state/trip-state";

import handoffStyles from "./plan-handoff-page.module.css";
import styles from "./trip-plan.module.css";

const copy = {
  en: {
    loading: "Opening your trip plan…",
    missing: (action: string) => `This tab doesn’t have a plan handoff. Return to your journey and choose ${action}.`,
    received: "The details below were captured from your journey when you opened this plan.",
    endDate: "End date",
    preferencesUnavailable: "Meri couldn’t read your preferences from the conversation.",
    noPreferences: "Meri found no travel preferences in the conversation.",
    itinerary: "Itinerary",
    awaitingItinerary: "Your journey details are ready. The itinerary hasn’t been generated yet.",
    remainingDays: "Remaining days",
    waitingForDays: "The rest of the itinerary is locked until you confirm how many days you’ll travel.",
  },
  zh: {
    loading: "正在打开行程计划…",
    missing: (action: string) => `当前标签页没有本次交接。请回到旅程，再点一次「${action}」。`,
    received: "下面是打开计划时从旅程带过来的信息。",
    endDate: "结束日期",
    preferencesUnavailable: "这次没能从对话中提取旅行偏好。",
    noPreferences: "这次对话里没有提取到旅行偏好。",
    itinerary: "行程安排",
    awaitingItinerary: "旅程信息已交接，具体行程还没有生成。",
    remainingDays: "剩下的几天",
    waitingForDays: "确认总天数后，才能安排剩下的行程。",
  },
} as const;

// The handoff is already written before navigation. Only the browser can read it.
const subscribe = () => () => {};

export function PlanHandoffPage({ tripId }: { readonly tripId: string }) {
  const locale = useLocale();
  const words = useMessages();
  const text = copy[locale];
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
  const handoff = useMemo(() => hydrated ? readPlanHandoff(tripId) : null, [hydrated, tripId]);

  const state = handoff?.tripState;
  const dayCount = state ? parseExactDays(state.duration) : null;
  const name = state?.name.state === "known" ? state.name.value : null;

  return (
    <div className={styles.page}>
      <div className={styles.background} aria-hidden="true" />
      <div className={styles.sheet}>
        <header className={styles.topBar}>
          <Link className={styles.brandLockup} href="/" aria-label="Meri">
            <Image src="/brand/meri-home-mountain.png" width={52} height={40} alt="" />
            <span>Meri</span>
          </Link>
          <Link className={styles.backLink} href={`/trips/${tripId}`} aria-label={words.plan.backToJourney}>
            <ArrowLeft aria-hidden="true" size={16} />
            <span>{words.plan.backToJourney}</span>
          </Link>
        </header>
        <main className={styles.heading}>
          {name ? <p className={styles.eyebrow}>{words.plan.eyebrow}</p> : null}
          <h1>{name ?? words.plan.eyebrow}</h1>
          {handoff ? (
            <>
              <p className={styles.overview}>{text.received}</p>
              <PlanFacts state={handoff.tripState} words={words} endDateLabel={text.endDate} dayCount={dayCount} />
              <section className={handoffStyles.preferences} aria-labelledby="plan-preferences-heading">
                <h2 id="plan-preferences-heading">{words.plan.memoriesTitle}</h2>
                {handoff.preferenceStatus === "unavailable" ? <p>{text.preferencesUnavailable}</p> :
                  handoff.preferences.length === 0 ? <p>{text.noPreferences}</p> : (
                    <ul>
                      {handoff.preferences.map(({ messageId, quote }) => (
                        <li key={`${messageId}:${quote}`}><q>{quote}</q></li>
                      ))}
                    </ul>
                  )}
              </section>
              <div className={handoffStyles.itinerary}>
                <section className={styles.locked} aria-labelledby="plan-itinerary-heading">
                  <h2 id="plan-itinerary-heading">{text.itinerary}</h2>
                  <p>{text.awaitingItinerary}</p>
                </section>
                {dayCount === null ? (
                  <section className={styles.locked} aria-labelledby="plan-remaining-days-heading">
                    <h2 id="plan-remaining-days-heading"><Lock aria-hidden="true" size={15} />{text.remainingDays}</h2>
                    <p>{text.waitingForDays}</p>
                  </section>
                ) : null}
              </div>
            </>
          ) : <p className={styles.overview} role="status">{hydrated ? text.missing(words.generatePlan.label) : text.loading}</p>}
        </main>
      </div>
    </div>
  );
}

function PlanFacts({ state, words, endDateLabel, dayCount }: {
  readonly state: TripState;
  readonly words: Messages;
  readonly endDateLabel: string;
  readonly dayCount: number | null;
}) {
  const brief = words.brief;
  function fieldLabel(field: TripStateField, knownLabel?: string): string {
    if (field.state === "missing") return brief.certainty.missing;
    if (field.state === "known") return knownLabel ?? field.value;
    return `${field.value} · ${brief.certaintyTag[field.state]}`;
  }
  function dateLabel(field: TripStateField): string {
    const date = toCalendarDate(field);
    return fieldLabel(field, date && words.dates.monthDay(date, true));
  }

  const facts = [
    [brief.fields.origin, fieldLabel(state.origin)],
    [brief.fields.destination, destinationText(state.destination) || brief.certainty.missing],
    [words.plan.factLabels.startDate, dateLabel(state.startDate)],
    [endDateLabel, dateLabel(state.endDate)],
    [words.dates.length, fieldLabel(state.duration, dayCount === null ? undefined : words.dates.days(dayCount))],
    [brief.fields.transportPreference, fieldLabel(state.transportPreference,
      state.transportPreference.state === "known" ? brief.transport[state.transportPreference.value] : undefined)],
  ] as const;

  return (
    <dl className={handoffStyles.facts}>
      {facts.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
