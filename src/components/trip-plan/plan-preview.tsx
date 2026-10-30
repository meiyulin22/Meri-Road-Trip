"use client";

import { RotateCcw } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import { useLocale, useMessages } from "@/components/i18n/locale-context";
import { ChatComposer } from "@/components/ui/chat-composer";

import { DayCard } from "./day-card";
import { PlanHeading, PlanTopBar } from "./plan-header";
import { PlanMap } from "./plan-map";
import { samplePlan } from "./plan-sample";
import { GettingThere, LockedDates, LockedDays, LockedGettingThere, PlanningSection, PlanProgress, SourcesCard } from "./plan-sections";
import {
  addDays, missingFacts, missingFor, runSteps, sectionReady, sectionsUsing, verificationCount,
  type FactKey, type PlanFacts, type Section, type Transport,
} from "./plan-view";
import styles from "./trip-plan.module.css";

type Stage = "generating" | "partial" | "complete";

const destinationOnly: PlanFacts = { days: null, startDate: null, origin: null, transport: null };
const allFacts: PlanFacts = { days: 5, startDate: samplePlan.startDate, origin: samplePlan.origin, transport: "flight" };
/** How long each fake run step takes, and a re-plan after a fact is given. */
const stepMs = 750;
const replanMs = 1600;

/** Where a missing fact is asked for on the page. */
const factSection: Record<FactKey, string> = {
  days: "plan-other-days", startDate: "plan-dates", origin: "plan-getting-there", transport: "plan-getting-there",
};

/**
 * The plan page as designed for 1.1000, on sample data. A preview switch shows its three
 * states: a run filling the page in step by step, a plan made from the destination alone
 * (the first day, the rest locked behind the facts they need), and a full plan. Facts given
 * on the page re-plan only the sections that use them, as the real page will.
 */
export function PlanPreview() {
  const locale = useLocale();
  const text = useMessages().plan;
  const reduce = useReducedMotion() ?? false;
  const [stage, setStage] = useState<Stage>("generating");
  const [runId, setRunId] = useState(0);
  const [facts, setFacts] = useState<PlanFacts>(allFacts);
  const [done, setDone] = useState(0);
  const [replanning, setReplanning] = useState<readonly Section[]>([]);
  const [openDay, setOpenDay] = useState<number | null>(1);
  const [mapDay, setMapDay] = useState<number | null>(1);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [memories, setMemories] = useState(samplePlan.memories);
  const [draft, setDraft] = useState("");
  const [replied, setReplied] = useState(false);

  const steps = runSteps(stage === "generating" ? allFacts : facts);
  const running = stage === "generating" && done < steps.length;

  useEffect(() => {
    if (stage !== "generating" || done >= steps.length) return;
    const timer = window.setTimeout(() => setDone((value) => value + 1), stepMs);
    return () => window.clearTimeout(timer);
  }, [stage, done, steps.length, runId]);

  useEffect(() => {
    if (replanning.length === 0) return;
    const timer = window.setTimeout(() => setReplanning([]), replanMs);
    return () => window.clearTimeout(timer);
  }, [replanning]);

  function choose(next: Stage) {
    setStage(next);
    setRunId((value) => value + 1);
    setFacts(next === "partial" ? destinationOnly : allFacts);
    setDone(next === "generating" ? 0 : Number.MAX_SAFE_INTEGER);
    setReplanning([]);
    setOpenDay(1);
    setMapDay(1);
    setMemories(samplePlan.memories);
    setReplied(false);
  }

  /** Give a fact: the sections it unlocks are planned now, and nothing else is touched. */
  function give(update: Partial<PlanFacts>) {
    const next = { ...facts, ...update };
    setFacts(next);
    const keys = Object.keys(update) as FactKey[];
    const unlocked = keys.flatMap(sectionsUsing).filter((section) => missingFor(section, next).length === 0);
    setReplanning(unlocked);
  }

  function onFact(fact: FactKey) {
    if (running) return;
    if (facts[fact] === null) {
      document.getElementById(factSection[fact])?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
      return;
    }
    setFacts({ ...facts, [fact]: null });
  }

  const ready = (section: Section) => missingFor(section, facts).length === 0 && !replanning.includes(section)
    && (stage !== "generating" || sectionReady(section, steps, done));
  const waiting = (section: Section) => missingFor(section, facts).length === 0 && !ready(section);

  const start = facts.startDate;
  const dayCount = Math.min(facts.days ?? 1, samplePlan.days.length);
  const shownDays = samplePlan.days.slice(0, ready("otherDays") ? dayCount : 1).filter((day) => day.day === 1 ? ready("firstDay") : true);
  const missing = missingFacts(facts).length;

  function revise(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim()) return;
    setDraft("");
    setReplied(true);
  }

  return (
    <div className={styles.page}>
      <div className={styles.background} aria-hidden="true" />
      <div className={styles.sheet}>
        <PlanTopBar />
        <PlanHeading plan={samplePlan} facts={facts} memories={memories}
          overview={text.overview(facts.days, missing, ready("firstDay"))}
          glance={shownDays.length === 0 ? null : {
            days: facts.days,
            cities: new Set(shownDays.map((day) => day.city)).size,
            roadMinutes: shownDays.reduce((sum, day) => sum + day.feasibility.roadMinutes, 0),
            checked: verificationCount(shownDays).verified,
          }}
          onFact={onFact} onForget={(id) => setMemories(memories.filter((memory) => memory.id !== id))} />
        <div className={styles.columns}>
          <div className={styles.planColumn}>
            {stage === "generating" ? <PlanProgress steps={steps} done={done} run={samplePlan.run} /> : (
              <p className={styles.runLine}>{text.runStats(samplePlan.run.seconds, samplePlan.run.toolCalls, samplePlan.run.costYuan)}</p>
            )}

            <div id="plan-getting-there">
              {missingFor("gettingThere", facts).length > 0 ? (
                <LockedGettingThere origin={facts.origin} transport={facts.transport}
                  onOrigin={(origin) => give({ origin })} onTransport={(transport: Transport) => give({ transport })} />
              ) : waiting("gettingThere") ? <PlanningSection title={text.gettingThereTitle} rows={2} /> : (
                <Appear>
                  <GettingThere transport={facts.transport ?? "flight"} outbound={samplePlan.outbound} homebound={samplePlan.homebound}
                    outboundDate={addDays(start ?? samplePlan.startDate, -1)}
                    homeboundDate={addDays(start ?? samplePlan.startDate, dayCount - 1)} />
                </Appear>
              )}
            </div>

            {waiting("firstDay") ? <PlanningSection title={text.dayLabel(1)} rows={4} /> : null}
            {shownDays.map((day) => (
              <Appear key={day.day}>
                <DayCard day={day} date={start ? addDays(start, day.day - 1) : null}
                  open={openDay === day.day}
                  onOpen={() => { setOpenDay(openDay === day.day ? null : day.day); setMapDay(day.day); }}
                  weatherKnown={ready("weather")} pricesKnown={ready("stays")} onHighlight={setHighlighted} />
              </Appear>
            ))}
            <div id="plan-other-days">
              {facts.days === null ? <LockedDays onChoose={(days) => give({ days })} />
                : waiting("otherDays") && ready("firstDay") ? <PlanningSection title={text.dayRange(2, dayCount)} rows={3} />
                  : facts.days > samplePlan.days.length && ready("otherDays")
                    ? <p className={styles.sectionNote}>{text.dayRange(samplePlan.days.length + 1, facts.days)} · {text.sampleNote}</p> : null}
            </div>
            <div id="plan-dates">
              {facts.startDate === null ? <LockedDates onChoose={(startDate) => give({ startDate })} /> : null}
            </div>

            <form className={styles.revise} onSubmit={revise}>
              <AnimatePresence>
                {replied ? (
                  <motion.p className={styles.reviseReply} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                    {text.reviseReply}
                  </motion.p>
                ) : null}
              </AnimatePresence>
              <ChatComposer id="plan-revise" value={draft} onChange={setDraft} redPanda
                onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) revise(event); }}
                disabled={running} canSubmit={draft.trim().length > 0} pending={false} prompts={text.revisePrompts}
                labels={{ input: text.reviseLabel, send: text.send, attachment: text.attachment, voice: text.voice }} />
            </form>
          </div>

          <aside className={styles.sideColumn}>
            <PlanMap days={shownDays} selected={mapDay !== null && shownDays.some((day) => day.day === mapDay) ? mapDay : null}
              onSelect={(day) => { setMapDay(day); if (day !== null) setOpenDay(day); }} highlighted={highlighted} />
            {shownDays.length > 0 ? <SourcesCard days={shownDays} /> : null}
          </aside>
        </div>
        <p className={styles.footNote}>{text.sampleNote}</p>
      </div>

      <div className={styles.previewSwitch} role="group" aria-label={text.previewLabel} lang={locale === "zh" ? "zh-CN" : "en"}>
        <span>{text.previewLabel}</span>
        {(["generating", "partial", "complete"] as const).map((value) => (
          <button type="button" key={value} aria-pressed={stage === value} onClick={() => choose(value)}>{text.previewStates[value]}</button>
        ))}
        {stage === "generating" ? (
          <button type="button" aria-label={text.replay} title={text.replay} onClick={() => choose("generating")}>
            <RotateCcw aria-hidden="true" size={14} />
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** A section arriving: it rises into place once, instead of popping in. */
function Appear({ children }: { readonly children: ReactNode }) {
  const reduce = useReducedMotion() ?? false;
  return (
    <motion.div initial={reduce ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}>
      {children}
    </motion.div>
  );
}
