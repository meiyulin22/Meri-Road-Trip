"use client";

import { ArrowLeft, CalendarDays, CalendarPlus, Car, ChevronDown, Clock3, Download, Image as ImageIcon, MapPin, Plus, Printer, RefreshCw, WifiOff, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { useLocale, useMessages } from "@/components/i18n/locale-context";
import { LanguageToggle } from "@/components/ui/language-toggle";

import type { FactKey, PlanFacts, PlanMemory, SamplePlan } from "./plan-view";
import styles from "./trip-plan.module.css";

const factIcon: Record<FactKey, typeof Clock3> = { days: Clock3, startDate: CalendarDays, origin: MapPin, transport: Car };

export function PlanTopBar({ calendarReady, onCalendar, onPrint }: {
  /** The calendar needs the start date. */
  readonly calendarReady: boolean;
  readonly onCalendar: () => void;
  readonly onPrint: () => void;
}) {
  const text = useMessages().plan;
  return (
    <header className={styles.topBar}>
      <Link className={styles.brandLockup} href="/" aria-label="Meri">
        <Image src="/brand/meri-home-mountain.png" width={52} height={40} alt="" />
        <span>Meri</span>
      </Link>
      <Link className={styles.backLink} href="/trips">
        <ArrowLeft aria-hidden="true" size={16} />
        <span>{text.backToJourney}</span>
      </Link>
      <span className={styles.sampleBadge} title={text.sampleNote}>{text.sampleBadge}</span>
      <ExportMenu calendarReady={calendarReady} onCalendar={onCalendar} onPrint={onPrint} />
      <LanguageToggle className={styles.languageToggle} />
    </header>
  );
}

export interface PlanGlance {
  /** Null until the traveller says how many days. */
  readonly days: number | null;
  readonly cities: number;
  readonly roadMinutes: number;
  readonly checked: number;
}

/** Take the plan out of Meri: into the phone's calendar, or onto paper / PDF; two more to come. */
function ExportMenu({ calendarReady, onCalendar, onPrint }: {
  readonly calendarReady: boolean;
  readonly onCalendar: () => void;
  readonly onPrint: () => void;
}) {
  const text = useMessages().plan;
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!box.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", escape); };
  }, [open]);

  const item = (icon: ReactNode, label: string, hint: string, action: (() => void) | null) => (
    <button type="button" role="menuitem" disabled={action === null} onClick={() => { action?.(); setOpen(false); }}>
      {icon}
      <span><strong>{label}</strong><small>{hint}</small></span>
    </button>
  );

  return (
    <div className={styles.exportMenu} ref={box}>
      <button type="button" className={styles.exportButton} aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(!open)}>
        <Download aria-hidden="true" size={15} />{text.exportLabel}<ChevronDown aria-hidden="true" size={14} />
      </button>
      {open ? (
        <div className={styles.exportList} role="menu">
          {item(<CalendarPlus aria-hidden="true" size={17} />, text.exportCalendar,
            calendarReady ? text.exportCalendarHint : text.exportCalendarLocked, calendarReady ? onCalendar : null)}
          {item(<Printer aria-hidden="true" size={17} />, text.exportPrint, text.exportPrintHint, onPrint)}
          {item(<ImageIcon aria-hidden="true" size={17} />, text.exportImage, text.comingSoon, null)}
          {item(<WifiOff aria-hidden="true" size={17} />, text.exportOffline, text.comingSoon, null)}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The plan's title and one-line overview, the facts it was planned from (each one a click
 * to give or change), and what Meri remembers about the traveller.
 */
export function PlanHeading({ plan, facts, overview, glance, memories, onFact, onForget, onAddPreference, onReplan, replanOffered }: {
  readonly plan: SamplePlan;
  /** The plan at a glance, once there is something planned to count. */
  readonly glance: PlanGlance | null;
  readonly facts: PlanFacts;
  readonly overview: string;
  readonly memories: readonly PlanMemory[];
  readonly onFact: (fact: FactKey) => void;
  readonly onForget: (id: string) => void;
  readonly onAddPreference: () => void;
  /** Offered after the traveller adds preferences; re-planning is their call, it costs a run. */
  readonly replanOffered: boolean;
  readonly onReplan: () => void;
}) {
  const locale = useLocale();
  const text = useMessages().plan;
  const value = (fact: FactKey): string | null => {
    if (fact === "days") return facts.days === null ? null : text.daysValue(facts.days);
    if (fact === "startDate") return facts.startDate === null ? null : text.dayDate(facts.startDate);
    if (fact === "transport") return facts.transport === null ? null : text.transportNames[facts.transport];
    return facts.origin;
  };
  return (
    <section className={styles.heading} aria-labelledby="plan-title">
      <div className={styles.headingRow}>
        <div className={styles.headingMain}>
          <p className={styles.eyebrow}>{text.eyebrow} · {plan.province}</p>
          <h1 id="plan-title">{plan.cities.map((city) => locale === "zh" ? city.name : city.nameEn).join(" → ")}</h1>
          <p className={styles.overview}>{overview}</p>
        </div>
        {glance ? (
          <dl className={styles.glance}>
            {([
              ["days", glance.days === null ? "–" : String(glance.days)],
              ["cities", String(glance.cities)],
              ["road", (glance.roadMinutes / 60).toFixed(1)],
              ["checked", String(glance.checked)],
            ] as const).map(([key, value]) => (
              <div key={key}>
                <dt>{text.glance[key]}</dt>
                <dd>{value}{text.glanceUnits[key] && value !== "–" ? <small>{text.glanceUnits[key]}</small> : null}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
      <ul className={styles.facts}>
        {(["days", "startDate", "origin", "transport"] as const).map((fact) => {
          const shown = value(fact);
          const Icon = factIcon[fact];
          return (
            <li key={fact}>
              <button type="button" className={styles.fact} data-known={shown !== null} onClick={() => onFact(fact)}
                aria-label={shown === null ? text.fillLabel(text.factLabels[fact]) : text.changeLabel(text.factLabels[fact])}>
                <Icon aria-hidden="true" size={14} />
                <span className={styles.factLabel}>{text.factLabels[fact]}</span>
                <span className={styles.factValue}>{shown ?? text.factPending[fact]}</span>
                {shown === null ? null : <span className={styles.factChange}>{text.change}</span>}
              </button>
            </li>
          );
        })}
      </ul>
      <div className={styles.memories}>
        <span className={styles.memoriesTitle}>{text.memoriesTitle}</span>
        <ul>
          {memories.map((memory) => (
            <li key={memory.id} data-added={memory.from === "added"}
              title={memory.from === "added" ? text.addedByYou : text.youSaid(memory.from.quote)}>
              {memory.label[locale]}
              <button type="button" aria-label={text.forget(memory.label[locale])} onClick={() => onForget(memory.id)}>
                <X aria-hidden="true" size={12} />
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className={styles.addPreference} onClick={onAddPreference}>
          <Plus aria-hidden="true" size={13} />{text.addPreference}
        </button>
        {replanOffered ? (
          <button type="button" className={styles.replanButton} onClick={onReplan}>
            <RefreshCw aria-hidden="true" size={13} />{text.replanForPreferences}
          </button>
        ) : null}
      </div>
    </section>
  );
}
