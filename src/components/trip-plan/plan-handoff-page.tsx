"use client";

import { ArrowLeft, Lock } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { type ReactNode, useMemo, useState, useSyncExternalStore } from "react";

import { useLocale, useMessages } from "@/components/i18n/locale-context";
import type { Messages } from "@/components/i18n/messages";
import { readPlanHandoff, savePlanHandoff } from "@/components/trip-workspace/planning-handoff-model";
import { toCalendarDate } from "@/components/trip-workspace/trip-dates-model";
import type { PlanHandoff } from "@/domain/plan/plan-handoff";
import { parseExactDate, parseExactDays } from "@/domain/trip-state/trip-dates";
import { destinationText, type TripState, type TripStateField } from "@/domain/trip-state/trip-state";

import { AddDatesButton, PlanDatesPicker } from "./plan-dates-picker";
import { PlanDraftSection } from "./plan-draft-section";
import { PlanMemories } from "./plan-memories";
import handoffStyles from "./plan-handoff-page.module.css";
import styles from "./trip-plan.module.css";

const copy = {
  en: {
    loading: "Opening your trip plan…",
    missing: (action: string) => `This journey has no plan yet. Open it from the home page and choose ${action}.`,
    received: "The details below were captured from your journey when you opened this plan.",
    endDate: "End date",
    itinerary: "Itinerary",
    remainingDays: "Remaining days",
    waitingForDays: "The rest of the itinerary is locked until you confirm how many days you’ll travel.",
  },
  zh: {
    loading: "正在打开行程计划…",
    missing: (action: string) => `这趟旅程还没有计划。请从主页打开它，点「${action}」。`,
    received: "下面是打开计划时从旅程带过来的信息。",
    endDate: "结束日期",
    itinerary: "行程安排",
    remainingDays: "剩下的几天",
    waitingForDays: "确认总天数后，才能安排剩下的行程。",
  },
} as const;

// The handoff is already written before navigation. Only the browser can read it.
const subscribe = () => () => {};

export function PlanHandoffPage({ tripId, savedHandoff = null }: {
  readonly tripId: string;
  /** The latest run's handoff from the server; used when this tab has none of its own. */
  readonly savedHandoff?: PlanHandoff | null;
}) {
  const locale = useLocale();
  const words = useMessages();
  const text = copy[locale];
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
  const stored = useMemo(() => hydrated ? readPlanHandoff(tripId) : null, [hydrated, tripId]);
  // Filling in the origin on this page gives the tab a new handoff to keep (1.2107).
  const [filled, setFilled] = useState<PlanHandoff | null>(null);
  const handoff = filled ?? stored ?? savedHandoff;
  const [preferenceChanges, setPreferenceChanges] = useState(0);
  // Bumped when the dates are filled in, so the plan section starts again from the new handoff.
  const [planRestarts, setPlanRestarts] = useState(0);
  const [datesOpen, setDatesOpen] = useState(false);

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
          {/* Home, not the Workspace: a journey with a plan is closed there (2026-11-21). */}
          <Link className={styles.backLink} href="/" aria-label={words.plan.backToHome}>
            <ArrowLeft aria-hidden="true" size={16} />
            <span>{words.plan.backToHome}</span>
          </Link>
        </header>
        <main className={styles.heading}>
          {name ? <p className={styles.eyebrow}>{words.plan.eyebrow}</p> : null}
          <h1>{name ?? words.plan.eyebrow}</h1>
          {handoff ? (
            <>
              <p className={styles.overview}>{text.received}</p>
              {/* No exact start date: filled in once, from the facts or wherever the plan needs it (2026-11-21/22). */}
              <PlanFacts state={handoff.tripState} words={words} endDateLabel={text.endDate} dayCount={dayCount}
                addDates={parseExactDate(handoff.tripState.startDate) === null
                  ? <AddDatesButton locale={locale} onClick={() => setDatesOpen(true)} /> : null} />
              <PlanDatesPicker tripId={tripId} days={dayCount} locale={locale} open={datesOpen} onClose={() => setDatesOpen(false)}
                onFilled={(next) => { savePlanHandoff(tripId, next); setFilled(next); setPlanRestarts((count) => count + 1); }} />
              <PlanMemories tripId={tripId} handoff={handoff} refreshKey={preferenceChanges} />
              <div className={handoffStyles.itinerary}>
                <section className={handoffStyles.itineraryHeading} aria-labelledby="plan-itinerary-heading">
                  <h2 id="plan-itinerary-heading">{text.itinerary}</h2>
                  <PlanDraftSection key={planRestarts} tripId={tripId} handoff={handoff}
                    onAddDates={parseExactDate(handoff.tripState.startDate) === null ? () => setDatesOpen(true) : undefined}
                    onPreferenceSaved={() => setPreferenceChanges((count) => count + 1)}
                    onHandoffChange={(next) => { savePlanHandoff(tripId, next); setFilled(next); }} />
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

function PlanFacts({ state, words, endDateLabel, dayCount, addDates }: {
  readonly state: TripState;
  readonly words: Messages;
  readonly endDateLabel: string;
  readonly dayCount: number | null;
  /** The add-dates button, shown in the start date's own cell while it is empty. */
  readonly addDates: ReactNode;
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

  const facts: readonly (readonly [string, string, ReactNode?])[] = [
    [brief.fields.origin, fieldLabel(state.origin)],
    [brief.fields.destination, destinationText(state.destination) || brief.certainty.missing],
    [words.plan.factLabels.startDate, dateLabel(state.startDate), addDates],
    [endDateLabel, dateLabel(state.endDate)],
    [words.dates.length, fieldLabel(state.duration, dayCount === null ? undefined : words.dates.days(dayCount))],
    [brief.fields.transportPreference, fieldLabel(state.transportPreference,
      state.transportPreference.state === "known" ? brief.transport[state.transportPreference.value] : undefined)],
  ];

  return (
    <dl className={handoffStyles.facts}>
      {facts.map(([label, value, action]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
          {action ?? null}
        </div>
      ))}
    </dl>
  );
}
