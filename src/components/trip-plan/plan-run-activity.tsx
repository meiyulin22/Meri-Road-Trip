"use client";

import { Check, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";

import { useLocale } from "@/components/i18n/locale-context";
import type { Locale } from "@/domain/locale/locale";
import type { PlanActivity, PlanQuestion, PlanStage } from "@/domain/plan/plan-progress";

import type { ProgressView, StageView } from "./plan-progress-view";
import styles from "./plan-run-activity.module.css";

const join = (locale: Locale, items: readonly string[]) => items.join(locale === "zh" ? "、" : ", ");

/** A few names, then how many more, so a long search fits on one line. */
function names(locale: Locale, items: readonly string[]): string {
  const shown = items.slice(0, 4);
  const rest = items.length - shown.length;
  return join(locale, shown) + (rest > 0 ? (locale === "zh" ? ` 等 ${items.length} 个` : ` +${rest}`) : "");
}

const copy = {
  en: {
    title: "Meri is planning",
    done: "Plan ready",
    stopped: "Planning stopped",
    waiting: "Waiting for your answer",
    answered: (question: string, choice: string | null) => `${question} → ${choice ?? "left to Meri"}`,
    stages: {
      scope: "Read the trip", research: "Research spots", map: "Locate on Tianditu", route: "Plan the route",
      days: "Choose each day's spots", verify: "Check opening and booking", photos: "Pick day photos", save: "Save the plan",
    } satisfies Record<PlanStage, string>,
    summary: (stage: PlanStage, s: Readonly<Record<string, number>>): string => {
      switch (stage) {
        case "scope": return `${s.cities} ${s.cities === 1 ? "city" : "cities"}`;
        case "research": return `${s.cards} cards · ${s.sourced} sourced · ${s.searches} searches`;
        case "map": return `located ${s.located}/${s.checked} · ${s.lookups} lookups`;
        case "route": return `${s.cities} ${s.cities === 1 ? "city" : "cities"} · ${s.days} ${s.days === 1 ? "day" : "days"}`;
        case "days": return `${s.stops} stops over ${s.days} ${s.days === 1 ? "day" : "days"}` + (s.conflicts ? ` · ${s.conflicts} to resolve` : "");
        case "verify": return `checked ${s.checked}/${s.stops}` + (s.reservations ? ` · ${s.reservations} need booking` : "")
          + (s.moved ? ` · ${s.moved} moved` : "") + (s.closed ? ` · ${s.closed} closed` : "");
        case "photos": return `${s.photos} ${s.photos === 1 ? "photo" : "photos"}`;
        case "save": return `version ${s.version}`;
      }
    },
    activity: (activity: PlanActivity, locale: Locale): string => {
      switch (activity.kind) {
        case "nominating": return `${activity.city} · picking the spots it's known for`;
        case "searching": return `${activity.city} · searching ${names(locale, activity.names)} (${activity.done}/${activity.total})`;
        case "reviewing": return `${activity.city} · reading ${activity.sources} results, one more search if needed`;
        case "extracting": return `${activity.city} · quoting sources from ${activity.sources} results`;
        case "locating": return `${activity.spot} · ${activity.done}/${activity.total}`;
        case "routing": return `${activity.cities} ${activity.cities === 1 ? "city" : "cities"}, ${activity.days} days` + (activity.attempt > 1 ? ` · attempt ${activity.attempt}` : "");
        case "drafting": return `${activity.city} · day ${activity.days.join(", ")}` + (activity.attempt > 1 ? ` · attempt ${activity.attempt}` : "");
        case "verifying": return `${activity.spot} · ${activity.done}/${activity.total}`;
        case "repairing": return `re-planning day ${activity.days.join(", ")} · round ${activity.round}`;
      }
    },
    verifyDetail: (rounds: number) => rounds === 0 ? "Nothing closed on its day." : `${rounds} repair ${rounds === 1 ? "round" : "rounds"}.`,
    city: (city: string, cards: number, sourced: number, searches: number) => `${city} · ${cards} cards, ${sourced} sourced, ${searches} searches`,
    cityStatus: { ready: "", partial: " · incomplete", unavailable: " · nothing found", deferred: " · later" },
    mapDetail: (located: number, notLocated: number) => `${located} located, ${notLocated} not found on the map`,
    mapStopped: "A lookup failed, so the check stopped there with no retry.",
    routeAuto: "Days shared out automatically.",
    finishedLine: (stage: string) => `${stage} done`,
  },
  zh: {
    title: "Meri 正在规划",
    done: "计划已生成",
    stopped: "规划中止",
    waiting: "等你回答",
    answered: (question: string, choice: string | null) => `${question} → ${choice ?? "交给 Meri 决定"}`,
    stages: {
      scope: "读取行程范围", research: "调研景点", map: "天地图定位", route: "规划路线",
      days: "按天选景点", verify: "核实开放与预约", photos: "配图", save: "保存计划",
    } satisfies Record<PlanStage, string>,
    summary: (stage: PlanStage, s: Readonly<Record<string, number>>): string => {
      switch (stage) {
        case "scope": return `${s.cities} 座城市`;
        case "research": return `${s.cards} 张卡 · ${s.sourced} 条有出处 · ${s.searches} 次搜索`;
        case "map": return `定位 ${s.located}/${s.checked} · ${s.lookups} 次查询`;
        case "route": return `${s.cities} 座城市 · ${s.days} 天`;
        case "days": return `${s.days} 天 · ${s.stops} 个景点` + (s.conflicts ? ` · ${s.conflicts} 项待处理` : "");
        case "verify": return `核实 ${s.checked}/${s.stops}` + (s.reservations ? ` · ${s.reservations} 处需预约` : "")
          + (s.moved ? ` · ${s.moved} 处换日` : "") + (s.closed ? ` · ${s.closed} 处关闭` : "");
        case "photos": return `${s.photos} 张`;
        case "save": return `第 ${s.version} 版`;
      }
    },
    activity: (activity: PlanActivity, locale: Locale): string => {
      switch (activity.kind) {
        case "nominating": return `${activity.city} · 提名代表景点`;
        case "searching": return `${activity.city} · 搜索 ${names(locale, activity.names)}（${activity.done}/${activity.total}）`;
        case "reviewing": return `${activity.city} · 检查 ${activity.sources} 条结果，必要时补查一次`;
        case "extracting": return `${activity.city} · 从 ${activity.sources} 条结果摘录出处`;
        case "locating": return `${activity.spot} · ${activity.done}/${activity.total}`;
        case "routing": return `${activity.cities} 座城市、${activity.days} 天` + (activity.attempt > 1 ? ` · 第 ${activity.attempt} 次` : "");
        case "drafting": return `${activity.city} · 第 ${activity.days.join("、")} 天` + (activity.attempt > 1 ? ` · 第 ${activity.attempt} 次` : "");
        case "verifying": return `${activity.spot} · ${activity.done}/${activity.total}`;
        case "repairing": return `重排第 ${activity.days.join("、")} 天 · 第 ${activity.round} 轮`;
      }
    },
    verifyDetail: (rounds: number) => rounds === 0 ? "所有景点当天都能去。" : `修正了 ${rounds} 轮。`,
    city: (city: string, cards: number, sourced: number, searches: number) => `${city} · ${cards} 张卡，${sourced} 条有出处，${searches} 次搜索`,
    cityStatus: { ready: "", partial: " · 未全部完成", unavailable: " · 没有找到", deferred: " · 稍后" },
    mapDetail: (located: number, notLocated: number) => `已定位 ${located} 个，${notLocated} 个位置未核实`,
    mapStopped: "有一次查询失败，按规则在那里停止，没有重试。",
    routeAuto: "自动分配天数。",
    finishedLine: (stage: string) => `${stage}完成`,
  },
} as const;

type Copy = (typeof copy)[Locale];

function formatMs(ms: number): string {
  if (ms < 1000) return `${(ms / 1000).toFixed(1)}s`;
  const seconds = Math.round(ms / 1000);
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** A clock for the stage that is running, from the time the server says it started. */
function useNow(running: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [running]);
  return now;
}

/**
 * The live activity of a plan run, like a terminal log: the running stage turns and
 * counts, with a line for what it is doing right now; finished stages fold into one ✓
 * line with their numbers and time, and open to show the details. Everything shown came
 * from a run event: there is no estimated progress.
 */
export function PlanRunActivity({ view }: { readonly view: ProgressView }) {
  const locale = useLocale();
  const text = copy[locale];
  const running = view.finished === null && view.question === null;
  const now = useNow(running);
  const [open, setOpen] = useState<PlanStage | null>(null);
  // The clock counts Meri's work only: it stops while the run waits for an answer.
  const elapsed = view.finished ? view.finished.ms : view.startedAt === null
    ? 0
    : Math.max(0, (view.waitingSince ?? now) - view.startedAt - view.waitedMs);
  const lastDone = [...view.stages].reverse().find(({ status }) => status === "done");
  const title = view.finished !== null
    ? view.finished.status === "succeeded" ? text.done : text.stopped
    : view.question ? text.waiting : text.title;

  return (
    <section className={styles.feed} data-state={view.finished?.status ?? "running"} aria-label={title}>
      <header className={styles.head}>
        <span className={styles.title}>{title}</span>
        <span className={styles.clock}>{formatMs(elapsed)}</span>
      </header>
      <ol className={styles.stages}>
        {view.stages.map((stage) => (
          <StageRow key={stage.stage} stage={stage} view={view} text={text} locale={locale} now={now}
            open={open === stage.stage} onToggle={() => setOpen(open === stage.stage ? null : stage.stage)} />
        ))}
      </ol>
      <span className={styles.srOnly} role="status">{lastDone ? text.finishedLine(text.stages[lastDone.stage]) : ""}</span>
    </section>
  );
}

function StageRow({ stage, view, text, locale, now, open, onToggle }: {
  readonly stage: StageView;
  readonly view: ProgressView;
  readonly text: Copy;
  readonly locale: Locale;
  readonly now: number;
  readonly open: boolean;
  readonly onToggle: () => void;
}) {
  const label = text.stages[stage.stage];
  if (stage.status === "pending") {
    // A stage the run never reached stays dim, also after the run stopped.
    return (
      <li className={styles.row} data-status="pending">
        <span className={styles.mark} aria-hidden="true">○</span>
        <span className={styles.label}>{label}</span>
      </li>
    );
  }
  if (stage.status === "running") {
    const stopped = view.finished !== null;
    const waiting = !stopped && view.question !== null;
    return (
      <li className={styles.row} data-status={stopped ? "stopped" : waiting ? "waiting" : "running"} aria-current={stopped ? undefined : "step"}>
        <span className={styles.mark} aria-hidden="true">{stopped ? "×" : waiting ? "?" : <span className={styles.spinner}>✻</span>}</span>
        <span className={styles.label}>{label}{waiting ? <span className={styles.waitingTag}>{text.waiting}</span> : null}</span>
        {stopped || waiting || stage.startedAt === null
          ? null
          : <span className={styles.time}>{formatMs(Math.max(0, now - stage.startedAt))}</span>}
        {stage.activities.length > 0 ? (
          <ul className={styles.activity}>
            {stage.activities.map((activity) => {
              const line = text.activity(activity, locale);
              // Keyed by the line itself, so each real change replays the colour cue.
              return <li key={("city" in activity ? activity.city : activity.kind) + line}>{line}</li>;
            })}
          </ul>
        ) : null}
      </li>
    );
  }

  const details = stageDetails(stage.stage, view, text);
  return (
    <li className={styles.row} data-status="done" data-open={open}>
      <span className={styles.mark} aria-hidden="true"><Check size={13} strokeWidth={3} /></span>
      {details.length > 0 ? (
        <button type="button" className={styles.toggle} aria-expanded={open} onClick={onToggle}>
          <span className={styles.label}>{label}</span>
          <span className={styles.summary}>{text.summary(stage.stage, stage.summary)}</span>
          <ChevronRight aria-hidden="true" size={13} className={styles.chevron} />
        </button>
      ) : (
        <span className={styles.toggle}>
          <span className={styles.label}>{label}</span>
          <span className={styles.summary}>{text.summary(stage.stage, stage.summary)}</span>
        </span>
      )}
      <span className={styles.time}>{stage.ms === null ? "" : formatMs(stage.ms)}</span>
      {open && details.length > 0 ? (
        <ul className={styles.details}>{details.map((line) => <li key={line}>{line}</li>)}</ul>
      ) : null}
    </li>
  );
}

/** What a finished stage opens to show, from the events it sent. */
function stageDetails(stage: PlanStage, view: ProgressView, text: Copy): string[] {
  if (stage === "research") {
    return view.cities.map(({ city, cards, sourced, searches, status, ms }) =>
      `${text.city(city, cards, sourced, searches)}${text.cityStatus[status]} · ${formatMs(ms)}`);
  }
  if (stage === "map" && view.map) {
    return [text.mapDetail(view.map.located, view.map.notLocated), ...(view.map.status === "stopped" ? [text.mapStopped] : [])];
  }
  if (stage === "verify") {
    const verify = view.stages.find(({ stage: item }) => item === "verify");
    return verify?.status === "done" ? [text.verifyDetail(verify.summary.rounds ?? 0)] : [];
  }
  if (stage === "route" && view.route) {
    return [
      ...view.answers.map(({ question, choice }) => text.answered(question, choice)),
      ...view.route.cities.map(({ city, days, reason }) => `${city} · ${days}${reason ? ` · ${reason}` : ""}`),
      ...view.route.omitted.map(({ city, reason }) => `${city} ×${reason ? ` · ${reason}` : ""}`),
      ...(view.route.source === "fallback" ? [text.routeAuto] : []),
    ];
  }
  return [];
}

const questionCopy = {
  en: { eyebrow: "A quick question first", skip: "You decide", failed: "That didn’t go through. Try again." },
  zh: { eyebrow: "Meri 想先问一句", skip: "你来定", failed: "没有发送成功，请再试一次。" },
} as const;

/**
 * The question a run waits on. Choosing an option, or letting Meri decide, resumes the
 * run; the answer is kept as a preference. Shown again after a refresh until answered.
 */
export function PlanQuestionCard({ question, onAnswer }: {
  readonly question: PlanQuestion;
  readonly onAnswer: (choice: string | null) => Promise<void>;
}) {
  const locale = useLocale();
  const text = questionCopy[locale];
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const choose = (choice: string | null) => {
    setSending(true);
    setFailed(false);
    onAnswer(choice).catch(() => {
      setFailed(true);
      setSending(false);
    });
  };
  return (
    <section className={styles.question} aria-labelledby={`question-${question.id}`}>
      <span className={styles.questionEyebrow}>{text.eyebrow}</span>
      <p className={styles.questionText} id={`question-${question.id}`}>{question.text}</p>
      <div className={styles.options}>
        {question.options.map(({ label }) => (
          <button key={label} type="button" className={styles.option} disabled={sending} onClick={() => choose(label)}>{label}</button>
        ))}
        <button type="button" className={styles.option} data-skip="true" disabled={sending} onClick={() => choose(null)}>{text.skip}</button>
      </div>
      {failed ? <p className={styles.questionError} role="alert">{text.failed}</p> : null}
    </section>
  );
}
