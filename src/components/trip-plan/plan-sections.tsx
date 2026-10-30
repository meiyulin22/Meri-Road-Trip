"use client";

import { CalendarDays, Car, Check, Lock, Plane, TrainFront } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useState, type ReactNode } from "react";

import { useLocale, useMessages } from "@/components/i18n/locale-context";
import { Skeleton } from "@/components/ui/skeleton";

import type { PlanDay, PlanJourneyOption, PlanRun, StepId, Transport } from "./plan-view";
import { verificationCount } from "./plan-view";
import styles from "./trip-plan.module.css";

/** A section waiting for one fact: says what it needs and asks for it right there, by click. */
function LockedSection({ title, text, children }: { readonly title: string; readonly text: string; readonly children: ReactNode }) {
  return (
    <section className={styles.locked}>
      <h2><Lock aria-hidden="true" size={15} />{title}</h2>
      <p>{text}</p>
      <div className={styles.lockedControls}>{children}</div>
    </section>
  );
}

/** A section being planned: the shape of what is coming, while the run fills it in. */
export function PlanningSection({ title, rows = 3 }: { readonly title: string; readonly rows?: number }) {
  const text = useMessages().plan;
  return (
    <section className={styles.planning} aria-busy="true">
      <h2>{title}<span>{text.planningSection}</span></h2>
      {Array.from({ length: rows }, (_, index) => (
        <div className={styles.planningRow} key={index}>
          <Skeleton className={styles.skeletonTime} />
          <Skeleton className={styles.skeletonLine} />
        </div>
      ))}
    </section>
  );
}

export function LockedDays({ onChoose }: { readonly onChoose: (days: number) => void }) {
  const text = useMessages().plan;
  return (
    <LockedSection title={text.otherDaysTitle} text={text.otherDaysText}>
      {[3, 4, 5, 6, 7].map((days) => (
        <button type="button" key={days} className={styles.choice} data-recommended={days === 5} onClick={() => onChoose(days)}>
          {text.daysValue(days)}{days === 5 ? <small>{text.recommended}</small> : null}
        </button>
      ))}
    </LockedSection>
  );
}

export function LockedDates({ onChoose }: { readonly onChoose: (date: string) => void }) {
  const text = useMessages().plan;
  const [custom, setCustom] = useState("");
  return (
    <LockedSection title={text.datesTitle} text={text.datesText}>
      {["2026-11-14", "2026-11-21"].map((date, index) => (
        <button type="button" key={date} className={styles.choice} data-recommended={index === 0} onClick={() => onChoose(date)}>
          <CalendarDays aria-hidden="true" size={14} />{text.dayDate(date)}{index === 0 ? <small>{text.recommended}</small> : null}
        </button>
      ))}
      <label className={styles.inlineField}>
        <span>{text.custom}</span>
        <input type="date" value={custom} min="2026-10-31" onChange={(event) => setCustom(event.target.value)} />
      </label>
      <button type="button" className={styles.confirm} disabled={!custom} onClick={() => onChoose(custom)}>{text.confirm}</button>
    </LockedSection>
  );
}

const transportIcon: Record<Transport, typeof Plane> = { flight: Plane, train: TrainFront, drive: Car };

export function LockedGettingThere({ origin, transport, onOrigin, onTransport }: {
  readonly origin: string | null;
  readonly transport: Transport | null;
  readonly onOrigin: (origin: string) => void;
  readonly onTransport: (transport: Transport) => void;
}) {
  const text = useMessages().plan;
  const [typed, setTyped] = useState("");
  return (
    <LockedSection title={text.gettingThereTitle} text={text.gettingThereText}>
      {origin ? (
        <span className={styles.chosen}><Check aria-hidden="true" size={14} />{origin}</span>
      ) : (
        <form className={styles.inlineField} onSubmit={(event) => { event.preventDefault(); if (typed.trim()) onOrigin(typed.trim()); }}>
          <input value={typed} placeholder={text.originPlaceholder} aria-label={text.originPlaceholder} onChange={(event) => setTyped(event.target.value)} />
          <button type="submit" className={styles.confirm} disabled={!typed.trim()}>{text.confirm}</button>
        </form>
      )}
      <span className={styles.choiceGroup}>
        {(["flight", "train", "drive"] as const).map((mode) => {
          const Icon = transportIcon[mode];
          return (
            <button type="button" key={mode} className={styles.choice} aria-pressed={transport === mode}
              data-recommended={mode === "flight"} onClick={() => onTransport(mode)}>
              <Icon aria-hidden="true" size={14} />{text.transportNames[mode]}{mode === "flight" ? <small>{text.recommended}</small> : null}
            </button>
          );
        })}
      </span>
    </LockedSection>
  );
}

function JourneyOption({ option }: { readonly option: PlanJourneyOption }) {
  const text = useMessages().plan;
  const Icon = option.mode === "flight" ? Plane : TrainFront;
  return (
    <li className={styles.journeyOption} data-recommended={option.recommended ?? false}>
      <Icon aria-hidden="true" size={16} />
      <span className={styles.journeyTimes}>
        <strong>{option.depart} → {option.arrive}</strong>
        <span>{option.from} → {option.to} · {option.number}</span>
      </span>
      <span className={styles.journeyPrice}>
        <strong>{text.fromPrice(option.price)}</strong>
        <span>{text.viaProvider(option.provider, option.checkedAt)}</span>
      </span>
      {option.recommended ? <span className={styles.recommendedTag}>{text.recommended}</span> : null}
    </li>
  );
}

/** The recommended option in full; the others one click away, so the days stay near the top. */
function JourneyOptions({ options }: { readonly options: readonly PlanJourneyOption[] }) {
  const text = useMessages().plan;
  const first = options.find((option) => option.recommended) ?? options[0];
  const others = options.filter((option) => option !== first);
  return (
    <>
      <ul>{first ? <JourneyOption option={first} /> : null}</ul>
      {others.length > 0 ? (
        <details className={styles.moreOptions}>
          <summary>{text.otherOptions(others.length)}</summary>
          <ul>{others.map((option) => <JourneyOption key={option.number} option={option} />)}</ul>
        </details>
      ) : null}
    </>
  );
}

export function GettingThere({ transport, outbound, homebound, outboundDate, homeboundDate }: {
  readonly transport: Transport;
  readonly outbound: readonly PlanJourneyOption[];
  readonly homebound: readonly PlanJourneyOption[];
  readonly outboundDate: string;
  readonly homeboundDate: string;
}) {
  const text = useMessages().plan;
  if (transport === "drive") {
    return (
      <section className={styles.gettingThere}>
        <h2><Car aria-hidden="true" size={16} />{text.gettingThereTitle}</h2>
        <p className={styles.sectionNote}>{text.driveNote}</p>
      </section>
    );
  }
  const fits = (option: PlanJourneyOption) => transport === "train" ? option.mode === "train" : true;
  const going = outbound.filter(fits);
  return (
    <section className={styles.gettingThere}>
      <h2>{transport === "flight" ? <Plane aria-hidden="true" size={16} /> : <TrainFront aria-hidden="true" size={16} />}{text.gettingThereTitle}</h2>
      <h3>{text.outbound} · {text.dayDate(outboundDate)}</h3>
      <JourneyOptions options={transport === "train" ? going.map((option) => ({ ...option, recommended: true })) : going} />
      {transport === "flight" ? (
        <>
          <h3>{text.homebound} · {text.dayDate(homeboundDate)}</h3>
          <JourneyOptions options={homebound} />
        </>
      ) : null}
    </section>
  );
}

/** The run, step by step, lit by real events; once done it folds into one line of what it took. */
export function PlanProgress({ steps, done, run }: { readonly steps: readonly StepId[]; readonly done: number; readonly run: PlanRun }) {
  const text = useMessages().plan;
  const reduce = useReducedMotion() ?? false;
  const finished = done >= steps.length;
  if (finished) {
    return (
      <p className={styles.runLine}>
        <Check aria-hidden="true" size={14} />{text.progressDone} · {text.runStats(run.seconds, run.toolCalls, run.costYuan)}
      </p>
    );
  }
  const current = steps[done];
  return (
    <section className={styles.progress} aria-live="polite">
      <div className={styles.progressTop}>
        <h2>{text.progressTitle}</h2>
        <span>{text.stepProgress(done + 1, steps.length)}</span>
      </div>
      <p className={styles.progressNow}>{text.steps[current]}…</p>
      <div className={styles.progressBar}>
        <motion.span animate={{ width: `${((done + 0.5) / steps.length) * 100}%` }} transition={{ duration: reduce ? 0 : 0.5 }} />
      </div>
      <ol className={styles.progressSteps}>
        {steps.map((step, index) => (
          <li key={step} data-state={index < done ? "done" : index === done ? "now" : "next"}>
            {index < done ? <Check aria-hidden="true" size={11} /> : null}{text.steps[step]}
          </li>
        ))}
      </ol>
    </section>
  );
}

/** How many opening times were checked against a source, and which could not be. */
export function SourcesCard({ days }: { readonly days: readonly PlanDay[] }) {
  const text = useMessages().plan;
  const locale = useLocale();
  const count = verificationCount(days);
  const missing = days.flatMap((day) => day.stops.filter((stop) => stop.hours?.verification.state === "unverified")
    .map((stop) => ({ day: day.day, stop })));
  return (
    <section className={styles.sourcesCard}>
      <h2>{text.sourcesTitle}</h2>
      <div className={styles.sourcesMeter} aria-hidden="true">
        <span style={{ flexGrow: count.verified }} />
        <span style={{ flexGrow: count.unverified }} />
      </div>
      <p>{text.sourcesSummary(count.verified, count.unverified)}</p>
      <ul>
        {missing.map(({ day, stop }) => (
          <li key={stop.id}>{text.dayLabel(day)} · {stop.name}<span>{stop.hours?.verification.state === "unverified" ? stop.hours.verification.reason[locale] : ""}</span></li>
        ))}
      </ul>
    </section>
  );
}
