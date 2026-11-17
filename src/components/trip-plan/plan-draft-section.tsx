"use client";

import { ArrowRight, CalendarCheck, Car, ChevronDown, Footprints, Clock, ExternalLink, Info, MapPin, MoonStar, RotateCw, Route, Sparkles, Star, Sun, Sunrise, TriangleAlert } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import { type CSSProperties, useEffect, useMemo, useReducer, useState } from "react";

import { useLocale } from "@/components/i18n/locale-context";
import { creditsHref } from "@/components/trip-workspace/destination-choices-card";
import { PhotoSourceCredit } from "@/components/trip-workspace/photo-source-dialog";
import type { PlaceImage } from "@/domain/location/place-image";
import type { Locale } from "@/domain/locale/locale";
import { type DaySlot, type DriveLeg, legReach, type PlanDay, type PlanRoute, type SpotFact, type StopCheck } from "@/domain/plan/plan-draft";
import type { ReadyPlan } from "@/domain/plan/plan-draft-response";
import type { PlanHandoff } from "@/domain/plan/plan-handoff";
import type { TransportPreference } from "@/domain/trip-draft/trip-draft";
import type { PlanRunStartResponse } from "@/domain/plan/plan-run";
import type { SpotCard, SpotEvidence } from "@/domain/plan/spot-card";

import {
  answerPlanQuestion,
  parseProgressMessage,
  PlanDraftRequestError,
  planRunEventsUrl,
  readLatestPlan,
  runFailure,
  sourceHost,
  sourcedFacts,
  startPlanRun,
  stopsBySlot,
  type PlanDraftFailure,
} from "./plan-draft-model";
import { applyProgress, emptyProgress, pendingDays, type ProgressView } from "./plan-progress-view";
import { PlanQuestionCard, PlanRunActivity, type QuestionAnswer } from "./plan-run-activity";
import { dayColor } from "./plan-day-colors";
import { legText } from "./plan-leg-text";
import { PlanTiandituMap } from "./plan-tianditu-map";
import draftStyles from "./plan-draft.module.css";
import styles from "./trip-plan.module.css";

const copy = {
  en: {
    working: "Opening your plan",
    workingHint: "If it isn't made yet, Meri starts it here and shows each step as it happens.",
    preview: "Preview day",
    dayLabel: (day: number) => `Day ${day}`,
    stopCount: (count: number) => `${count} ${count === 1 ? "stop" : "stops"}`,
    slots: { morning: "Morning", afternoon: "Afternoon", evening: "Evening" } satisfies Record<DaySlot, string>,
    requested: "You chose this",
    facts: { location: "Location", opening: "Opening", reservation: "Booking", setting: "Setting", walking: "Walking", suggestedDuration: "Time to allow" } satisfies Record<SpotFact, string>,
    unverified: (fields: string) => `To check: ${fields}`,
    sources: (count: number) => `${count} ${count === 1 ? "source" : "sources"}`,
    checked: (date: string) => `checked ${date}`,
    summary: { days: "days", stops: "stops", sourced: "with sources", located: "on the map", conflicts: "to resolve" },
    located: (district: string | null) => district ? `On the map · ${district}` : "On the map",
    notLocated: "Not found on the map",
    check: {
      open: "Open that day", partial: "Partly closed", closed: "Closed that day", uncertain: "Opening to confirm",
    } satisfies Record<Exclude<StopCheck["status"], "unchecked">, string>,
    booking: (days: number | null) => days === null ? "Booking needed" : `Book ${days} ${days === 1 ? "day" : "days"} ahead`,
    movedFrom: (day: number) => `Moved from day ${day}`,
    availabilityLabel: "Opening",
    hours: (open: string, close: string) => `Open ${open}–${close}`,
    weekday: ["", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"],
    closedWeekday: (days: string, scope: string | null) => `Closed on ${days}${scope ? ` (${scope})` : ""}`,
    closedRange: (from: string, to: string, scope: string | null) => `Closed ${from} to ${to}${scope ? ` (${scope})` : ""}`,
    closedOnDay: (name: string, day: number) => `${name} is closed on day ${day}, and no other day in its city could take it.`,
    mapStopped: "The map check is unavailable right now, so some spots show as not found on the map.",
    conflictsTitle: "Couldn’t fit everything",
    requestedUnscheduled: (name: string) => `${name} isn’t in the plan yet.`,
    notEnough: (day: number) => `Day ${day} has no spots yet: research found too few candidates.`,
    researchPartial: (cities: string) => `Some research for ${cities} didn’t finish, so there may be fewer options.`,
    pendingProvinces: (provinces: string) => `${provinces}: choose a city to include it.`,
    routeDays: (days: number) => `${days} ${days === 1 ? "day" : "days"}`,
    routeTitle: "Route",
    routeFallback: "Days shared out automatically",
    omittedTitle: "Not in this trip",
    omittedFallback: (days: number) => `Only ${days} ${days === 1 ? "day" : "days"}: kept the first cities in the order you added them.`,
    transfer: (from: string, to: string) => `${from} → ${to}`,
    transferNote: "Transfer day · travel time to be confirmed",
    noCity: "Choose a city in your journey to start planning.",
    failed: {
      journey_changed: "Your journey changed after this plan was opened. Go back and choose Generate plan again.",
      unavailable: "The planner is busy right now. Try again in a moment.",
      failed: "Meri couldn’t arrange the days this time.",
      time_limit: "This plan took too long and was stopped. Try again.",
      interrupted: "The server restarted while planning, so this plan stopped. Try again.",
    } satisfies Record<PlanDraftFailure, string>,
    retry: "Try again",
  },
  zh: {
    working: "正在打开计划",
    workingHint: "还没生成的话，Meri 会在这里开始规划，并实时显示每一步。",
    preview: "示范日",
    dayLabel: (day: number) => `第 ${day} 天`,
    stopCount: (count: number) => `${count} 个景点`,
    slots: { morning: "上午", afternoon: "下午", evening: "晚上" } satisfies Record<DaySlot, string>,
    requested: "你点名的",
    facts: { location: "位置", opening: "开放", reservation: "预约", setting: "室内外", walking: "步行", suggestedDuration: "建议停留" } satisfies Record<SpotFact, string>,
    unverified: (fields: string) => `待核实：${fields}`,
    sources: (count: number) => `${count} 条出处`,
    checked: (date: string) => `${date} 查询`,
    summary: { days: "天", stops: "个景点", sourced: "有出处", located: "已定位", conflicts: "待处理" },
    located: (district: string | null) => district ? `已定位 · ${district}` : "已定位",
    notLocated: "位置未核实",
    check: {
      open: "当天开放", partial: "部分关闭", closed: "当天关闭", uncertain: "开放待确认",
    } satisfies Record<Exclude<StopCheck["status"], "unchecked">, string>,
    booking: (days: number | null) => days === null ? "需预约" : `需预约 · 提前 ${days} 天`,
    movedFrom: (day: number) => `从第 ${day} 天换来`,
    availabilityLabel: "开放",
    hours: (open: string, close: string) => `${open}–${close} 开放`,
    weekday: ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"],
    closedWeekday: (days: string, scope: string | null) => `每${days}不开放${scope ? `（${scope}）` : ""}`,
    closedRange: (from: string, to: string, scope: string | null) => `${from} 至 ${to} 关闭${scope ? `（${scope}）` : ""}`,
    closedOnDay: (name: string, day: number) => `${name}第 ${day} 天关闭，同城其他日子也排不进去。`,
    mapStopped: "位置核实暂时不可用，部分景点显示为位置未核实。",
    conflictsTitle: "有些安排没排进去",
    requestedUnscheduled: (name: string) => `${name}还没排进行程。`,
    notEnough: (day: number) => `第 ${day} 天暂时空着：调研到的候选不够。`,
    researchPartial: (cities: string) => `${cities}的部分调研没有完成，候选可能偏少。`,
    pendingProvinces: (provinces: string) => `${provinces}：选定城市后才会纳入规划。`,
    routeDays: (days: number) => `${days} 天`,
    routeTitle: "路线",
    routeFallback: "自动分配天数",
    omittedTitle: "这次没排入",
    omittedFallback: (days: number) => `只有 ${days} 天，按添加顺序保留了前面的城市。`,
    transfer: (from: string, to: string) => `${from} → ${to}`,
    transferNote: "转场日 · 车程待核实",
    noCity: "请先在旅程里选定城市再规划。",
    failed: {
      journey_changed: "打开计划后旅程有了变化。请回到旅程，再点一次 Generate plan。",
      unavailable: "规划服务暂时繁忙，请稍后再试。",
      failed: "这次没能排好行程。",
      time_limit: "这次规划用时过长，已经停止，请重试。",
      interrupted: "规划过程中服务器重启了，这次没有完成，请重试。",
    } satisfies Record<PlanDraftFailure, string>,
    retry: "重试",
  },
} as const;

type Copy = (typeof copy)[Locale];

type DraftState =
  | { readonly kind: "starting" }
  | { readonly kind: "running"; readonly runId: string }
  | { readonly kind: "ready"; readonly plan: ReadyPlan; readonly progress: ProgressView | null }
  | { readonly kind: "unsupported" }
  | { readonly kind: "failed"; readonly reason: PlanDraftFailure; readonly progress: ProgressView | null };

// React's development double effect and a remount join the request already sent; the
// server also joins requests for the same handoff to one run.
const inFlight = new Map<string, Promise<PlanRunStartResponse>>();

function startFor(tripId: string, handoff: PlanHandoff): Promise<PlanRunStartResponse> {
  const key = tripId + JSON.stringify(handoff);
  const running = inFlight.get(key);
  if (running) return running;
  const request = startPlanRun(tripId, handoff, new AbortController().signal).finally(() => inFlight.delete(key));
  inFlight.set(key, request);
  return request;
}

function formatDate(date: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en", {
    month: "short", day: "numeric", weekday: "short", timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

function checkedDate(evidence: SpotEvidence, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en", { month: "short", day: "numeric" })
    .format(new Date(evidence.checkedAt));
}

/**
 * The plan for the handoff this tab holds. The server either has it saved, is making it,
 * or starts a run; a running plan streams its real progress and its days as they come.
 */
export function PlanDraftSection({ tripId, handoff, onPreferenceSaved = () => {} }: {
  readonly tripId: string;
  readonly handoff: PlanHandoff;
  /** Called when answering the plan's question saved a new preference. */
  readonly onPreferenceSaved?: () => void;
}) {
  const locale = useLocale();
  const text = copy[locale];
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<DraftState>({ kind: "starting" });

  useEffect(() => {
    if (state.kind !== "starting") return;
    let active = true;
    startFor(tripId, handoff)
      .then((response) => {
        if (!active) return;
        if (response.status === "ready") setState({ kind: "ready", plan: response.plan, progress: null });
        else if (response.status === "running") setState({ kind: "running", runId: response.runId });
        else setState({ kind: "unsupported" });
      })
      .catch((error: unknown) => {
        if (active) setState({ kind: "failed", reason: error instanceof PlanDraftRequestError ? error.reason : "failed", progress: null });
      });
    return () => { active = false; };
  }, [attempt, handoff, state.kind, tripId]);

  const retry = () => { setState({ kind: "starting" }); setAttempt(attempt + 1); };

  if (state.kind === "starting") return <DraftLoading text={text} />;
  if (state.kind === "running") {
    return (
      <LiveRun key={state.runId} tripId={tripId} runId={state.runId} text={text} locale={locale}
        onAnswered={onPreferenceSaved}
        onDone={(plan, progress) => setState({ kind: "ready", plan, progress })}
        onFailed={(reason, progress) => setState({ kind: "failed", reason, progress })} />
    );
  }
  if (state.kind === "failed") {
    return (
      <div className={draftStyles.draft}>
        {state.progress ? <PlanRunActivity view={state.progress} /> : null}
        <section className={draftStyles.notice} data-tone="error" role="alert">
          <TriangleAlert aria-hidden="true" size={18} />
          <div>
            <p>{text.failed[state.reason]}</p>
            {state.reason === "journey_changed" ? null : (
              <button type="button" className={draftStyles.retry} onClick={retry}>
                <RotateCw aria-hidden="true" size={14} />{text.retry}
              </button>
            )}
          </div>
        </section>
      </div>
    );
  }
  if (state.kind === "unsupported") {
    return (
      <section className={draftStyles.notice} role="status">
        <Info aria-hidden="true" size={18} />
        <p>{text.noCity}</p>
      </section>
    );
  }
  return (
    <div className={draftStyles.draft}>
      {state.progress ? <PlanRunActivity view={state.progress} /> : null}
      <DraftDays response={state.plan} text={text} locale={locale}
        transport={handoff.tripState.transportPreference.state === "known" ? handoff.tripState.transportPreference.value : null} />
    </div>
  );
}

/**
 * Follows a run over Server-Sent Events. EventSource reconnects by itself with the last
 * event id, so a dropped connection resumes where it stopped. When the run ends, the
 * saved version replaces the streamed days.
 */
function LiveRun({ tripId, runId, text, locale, onDone, onFailed, onAnswered }: {
  readonly onAnswered: () => void;
  readonly tripId: string;
  readonly runId: string;
  readonly text: Copy;
  readonly locale: Locale;
  readonly onDone: (plan: ReadyPlan, progress: ProgressView) => void;
  readonly onFailed: (reason: PlanDraftFailure, progress: ProgressView) => void;
}) {
  const [view, dispatch] = useReducer(applyProgress, emptyProgress);
  // A new connection after each answer, starting after the last event this page has.
  const [after, setAfter] = useState(0);
  // The first day opens by itself when it arrives, until the reader opens or closes one.
  const [openDay, setOpenDay] = useState<number | null | "first">("first");

  useEffect(() => {
    const source = new EventSource(planRunEventsUrl(tripId, runId, after));
    source.onmessage = (message: MessageEvent<string>) => {
      const envelope = parseProgressMessage(message.data, runId);
      if (!envelope) return;
      dispatch(envelope);
      // Over, or paused for an answer: the server ends the stream, so do not reconnect.
      if (envelope.event.type === "run.finished" || envelope.event.type === "run.waiting") source.close();
    };
    return () => source.close();
  }, [after, runId, tripId]);

  const answer = async (reply: QuestionAnswer) => {
    if (!view.question) return;
    await answerPlanQuestion(tripId, runId, { questionId: view.question.id, ...reply }, new AbortController().signal);
    setAfter(view.lastSeq);
    // Any answer but "you decide" is saved as a preference, so the list above refreshes.
    if (!("choice" in reply) || reply.choice !== null) onAnswered();
  };

  const finished = view.finished;
  useEffect(() => {
    if (!finished) return;
    if (finished.status !== "succeeded") {
      onFailed(runFailure(finished.errorCode), view);
      return;
    }
    const controller = new AbortController();
    readLatestPlan(tripId, controller.signal)
      .then(({ version }) => {
        if (version && version.runId === runId) onDone(version.plan, view);
        else onFailed("failed", view);
      })
      .catch(() => { if (!controller.signal.aborted) onFailed("failed", view); });
    return () => controller.abort();
    // The view at the moment the run finished is the one kept.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  const cards = useMemo(() => new Map(Object.entries(view.spots)), [view.spots]);
  const shownOpen = openDay === "first" ? view.days[0]?.day ?? null : openDay;
  return (
    <section className={draftStyles.draft} aria-busy="true">
      <PlanRunActivity view={view} />
      {view.question ? <PlanQuestionCard key={view.question.id} question={view.question} onAnswer={answer} /> : null}
      {view.route ? <RouteStrip route={view.route} text={text} /> : null}
      {view.days.length > 0 || view.route ? (
        <div className={draftStyles.days}>
          {view.days.map((day, index) => (
            <DraftDay key={day.day} day={day} cards={cards} text={text} locale={locale} index={index}
              photo={view.photos[day.day] ?? null} preview={view.scope?.mode === "preview"} unverified={new Map()}
              // Drive times arrive with the saved plan; the live view shows the days without them.
              arriving={new Map()}
              checks={new Map(day.stops.flatMap(({ spotId }) => {
                const check = view.checks[`${day.day}|${spotId}`];
                return check ? [[spotId, check] as const] : [];
              }))}
              open={shownOpen === day.day} onOpen={() => setOpenDay(shownOpen === day.day ? null : day.day)} />
          ))}
          {pendingDays(view).map((day) => (
            <div key={day} className={draftStyles.skeletonCard} aria-hidden="true">
              <span className={draftStyles.skeletonBadge} />
              <span className={draftStyles.skeletonLines}><span /><span /></span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function DraftLoading({ text }: { readonly text: Copy }) {
  return (
    <section className={draftStyles.loading} aria-busy="true">
      <div className={draftStyles.working} role="status">
        <span className={draftStyles.workingIcon} aria-hidden="true"><Sparkles size={16} /></span>
        <div>
          <p>{text.working}</p>
          <small>{text.workingHint}</small>
        </div>
      </div>
    </section>
  );
}

function DraftDays({ response, text, locale, transport }: {
  readonly response: ReadyPlan;
  readonly text: Copy;
  readonly locale: Locale;
  /** How the traveller gets around, for the wording of road legs (1.2103). */
  readonly transport: TransportPreference | null;
}) {
  const { draft } = response;
  const cards = useMemo(() => new Map(response.spots.map((card) => [card.id, card])), [response.spots]);
  const photos = useMemo(() => new Map(response.dayPhotos.map(({ day, image }) => [day, image])), [response.dayPhotos]);
  const [openDay, setOpenDay] = useState<number | null>(draft.days[0]?.day ?? null);
  const stops = draft.days.reduce((count, day) => count + day.stops.length, 0);
  const sourced = draft.days.flatMap((day) => day.stops).filter(({ spotId }) => cards.get(spotId)?.location).length;
  const located = draft.days.flatMap((day) => day.stops).filter(({ spotId }) => cards.get(spotId)?.mapCheck.status === "located").length;
  const partial = response.cities.filter(({ status }) => status === "partial" || status === "unavailable").map(({ city }) => city);
  const nameOf = (spotId: string) => cards.get(spotId)?.name ?? spotId;

  return (
    <section className={draftStyles.draft} aria-label={text.dayLabel(1)}>
      <dl className={draftStyles.summary}>
        <div><dt>{text.summary.days}</dt><dd>{draft.days.length}</dd></div>
        <div><dt>{text.summary.stops}</dt><dd>{stops}</dd></div>
        <div><dt>{text.summary.sourced}</dt><dd>{sourced}/{stops}</dd></div>
        <div><dt>{text.summary.located}</dt><dd>{located}/{stops}</dd></div>
        {draft.conflicts.length > 0 ? (
          <div data-tone="warn"><dt>{text.summary.conflicts}</dt><dd>{draft.conflicts.length}</dd></div>
        ) : null}
      </dl>

      {response.mapCheck === "stopped" ? (
        <div className={draftStyles.notice} role="status">
          <Info aria-hidden="true" size={18} />
          <p>{text.mapStopped}</p>
        </div>
      ) : null}

      {draft.conflicts.length > 0 ? (
        <div className={draftStyles.notice} data-tone="warn">
          <TriangleAlert aria-hidden="true" size={18} />
          <div>
            <p className={draftStyles.noticeTitle}>{text.conflictsTitle}</p>
            <ul>
              {draft.conflicts.map((conflict) => (
                <li key={conflict.kind === "not_enough_candidates" ? `day-${conflict.day}` : `${conflict.kind}-${conflict.spotId}`}>
                  {conflict.kind === "requested_unscheduled" ? text.requestedUnscheduled(nameOf(conflict.spotId))
                    : conflict.kind === "closed_on_day" ? text.closedOnDay(nameOf(conflict.spotId), conflict.day)
                      : text.notEnough(conflict.day)}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      <RouteStrip route={draft.route} text={text} />
      {draft.route.omitted.length > 0 ? (
        <div className={draftStyles.notice} data-tone="warn">
          <TriangleAlert aria-hidden="true" size={18} />
          <div>
            <p className={draftStyles.noticeTitle}>{text.omittedTitle}</p>
            <ul>
              {draft.route.omitted.map(({ city, reason }) => (
                <li key={city}><strong>{city}</strong>{reason ? `${locale === "zh" ? "：" : ": "}${reason}` : ""}</li>
              ))}
            </ul>
            {draft.route.omitted.some(({ reason }) => reason === null) ? <p>{text.omittedFallback(draft.days.length)}</p> : null}
          </div>
        </div>
      ) : null}

      <PlanTiandituMap plan={response} locale={locale} selectedDay={openDay} onSelectDay={setOpenDay} />

      <div className={draftStyles.days}>
        {draft.days.map((day, index) => (
          <DraftDay key={day.day} day={day} cards={cards} text={text} locale={locale} index={index} photo={photos.get(day.day) ?? null}
            preview={draft.mode === "preview"}
            unverified={new Map(draft.unverified.map(({ spotId, fields }) => [spotId, fields]))}
            checks={new Map((draft.checks ?? []).filter(({ day: number }) => number === day.day).map((check) => [check.spotId, check]))}
            arriving={arrivingLegs(day, draft.legs ?? [])} transport={transport}
            open={openDay === day.day} onOpen={() => setOpenDay(openDay === day.day ? null : day.day)} />
        ))}
      </div>

      {partial.length > 0 || response.pendingProvinces.length > 0 ? (
        <div className={draftStyles.footnotes}>
          {partial.length > 0 ? <p>{text.researchPartial(partial.join("、"))}</p> : null}
          {response.pendingProvinces.length > 0 ? <p>{text.pendingProvinces(response.pendingProvinces.join("、"))}</p> : null}
        </div>
      ) : null}
    </section>
  );
}

/** A walk, a drive, or — where the time cannot be given — a plain route mark (1.2105). */
function LegIcon({ leg }: { readonly leg: DriveLeg }) {
  if (legReach(leg).kind !== "way") return <Route aria-hidden="true" size={12} />;
  return leg.mode === "walk" ? <Footprints aria-hidden="true" size={12} /> : <Car aria-hidden="true" size={12} />;
}

const slotIcon = { morning: Sunrise, afternoon: Sun, evening: MoonStar } satisfies Record<DaySlot, typeof Sun>;

/** Each stop's drive from the stop before it in the day, where Tianditu planned one (1.2102). */
function arrivingLegs(day: PlanDay, legs: readonly DriveLeg[]): ReadonlyMap<string, DriveLeg> {
  return new Map(day.stops.slice(1).flatMap(({ spotId }, index) => {
    const leg = legs.find((item) => item.day === day.day && item.fromSpotId === day.stops[index].spotId && item.toSpotId === spotId);
    return leg ? [[spotId, leg] as const] : [];
  }));
}

function DraftDay({ day, cards, unverified, checks, arriving, transport = null, text, locale, preview, open, onOpen, index, photo }: {
  readonly transport?: TransportPreference | null;
  /** Each stop's drive from the stop before it, by spot ID; absent where none was planned. */
  readonly arriving: ReadonlyMap<string, DriveLeg>;
  /** The second round's verdict per stop of this day, by spot ID. */
  readonly checks: ReadonlyMap<string, StopCheck>;
  readonly day: PlanDay;
  readonly photo: PlaceImage | null;
  readonly cards: ReadonlyMap<string, SpotCard>;
  readonly unverified: ReadonlyMap<string, readonly SpotFact[]>;
  readonly text: Copy;
  readonly locale: Locale;
  readonly preview: boolean;
  readonly open: boolean;
  readonly onOpen: () => void;
  readonly index: number;
}) {
  const reduce = useReducedMotion() ?? false;
  const headingId = `draft-day-${day.day}`;
  const title = day.theme ?? day.stops.map(({ spotId }) => cards.get(spotId)?.name ?? spotId).join(" · ");

  return (
    <motion.article className={styles.dayCard} data-open={open} aria-labelledby={headingId}
      initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: reduce ? 0 : index * 0.06, ease: [0.22, 1, 0.36, 1] }}>
      <button type="button" className={styles.dayHeader} aria-expanded={open} onClick={onOpen}>
        {/* The day's colour, as on the map (1.2105). */}
        <span className={styles.dayNumber}
          style={{ "--day-color": dayColor(day.day).solid, "--day-soft": dayColor(day.day).soft } as CSSProperties}>{day.day}</span>
        <span className={styles.dayHeading}>
          <span className={styles.dayMeta}>
            {text.dayLabel(day.day)}{day.date ? ` · ${formatDate(day.date, locale)}` : ""} · {day.city}
            {day.focus ? ` · ${day.focus}` : ""}
            {preview ? <span className={draftStyles.previewTag}>{text.preview}</span> : null}
            {day.arrivingFrom ? (
              <span className={draftStyles.transferTag} title={text.transferNote}>
                {text.transfer(day.arrivingFrom, day.city)}
              </span>
            ) : null}
          </span>
          <span className={styles.dayTitle} id={headingId}>{title || "—"}</span>
        </span>
        <span className={styles.dayAside}>
          {open ? null : <span className={styles.daySights}>{text.stopCount(day.stops.length)}</span>}
          {photo && !open ? (
            <span className={draftStyles.thumb}>
              <Image src={photo.url} alt="" fill sizes="56px" />
            </span>
          ) : null}
          <ChevronDown aria-hidden="true" size={18} className={styles.dayChevron} />
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div key="body" className={styles.dayBody}
            initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.32, ease: [0.22, 1, 0.36, 1] }}>
            {photo ? <DayPhoto photo={photo} /> : null}
            <div className={draftStyles.slots}>
              {stopsBySlot(day).map(({ slot, stops }) => {
                const SlotIcon = slotIcon[slot];
                return (
                  <section key={slot} className={draftStyles.slot} data-slot={slot}>
                    <h3 className={draftStyles.slotLabel}><SlotIcon aria-hidden="true" size={14} />{text.slots[slot]}</h3>
                    <ol className={draftStyles.stops}>
                      {stops.map((stop) => {
                        const card = cards.get(stop.spotId);
                        const missing = unverified.get(stop.spotId) ?? [];
                        const leg = arriving.get(stop.spotId);
                        return (
                          <li key={stop.spotId} className={draftStyles.stop}>
                            {leg ? (
                              <p className={draftStyles.driveLine}>
                                <LegIcon leg={leg} />
                                {legText(leg, transport, locale, {
                                  from: cards.get(leg.fromSpotId)?.name ?? leg.fromSpotId,
                                  to: card?.name ?? leg.toSpotId,
                                })}
                              </p>
                            ) : null}
                            <div className={draftStyles.stopHead}>
                              {stop.anchor ? (
                                <span className={draftStyles.anchor} title={stop.anchor.evidence.quote}>
                                  <Clock aria-hidden="true" size={12} />{stop.anchor.time}
                                </span>
                              ) : null}
                              <h4>{card?.name ?? stop.spotId}</h4>
                              {card?.requested ? (
                                <span className={draftStyles.requested}><Star aria-hidden="true" size={11} />{text.requested}</span>
                              ) : null}
                              {card ? (
                                <span className={draftStyles.mapBadge} data-located={card.mapCheck.status === "located"}>
                                  <MapPin aria-hidden="true" size={11} />
                                  {card.mapCheck.status === "located" ? text.located(card.mapCheck.district) : text.notLocated}
                                </span>
                              ) : null}
                              <StopCheckBadges check={checks.get(stop.spotId)} text={text} />
                            </div>
                            {stop.anchor ? <p className={draftStyles.anchorReason}>{stop.anchor.reason}</p> : null}
                            {card ? <StopFacts card={card} missing={missing} text={text} locale={locale} /> : null}
                          </li>
                        );
                      })}
                    </ol>
                  </section>
                );
              })}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.article>
  );
}

/** The second round on one stop: open or not that day, booking, and whether it was moved. */
function StopCheckBadges({ check, text }: { readonly check: StopCheck | undefined; readonly text: Copy }) {
  if (!check) return null;
  return (
    <>
      {check.status !== "unchecked" ? (
        <span className={draftStyles.checkBadge} data-status={check.status}>
          <CalendarCheck aria-hidden="true" size={11} />{text.check[check.status]}
        </span>
      ) : null}
      {check.reservation ? <span className={draftStyles.checkBadge} data-status="booking">{text.booking(check.reservation.daysAhead)}</span> : null}
      {check.movedFrom !== null ? <span className={draftStyles.checkBadge} data-status="moved">{text.movedFrom(check.movedFrom)}</span> : null}
    </>
  );
}

/** The second round's facts as lines to read, each with the quote it rests on. */
function availabilityLines(card: SpotCard, text: Copy): { label: string; line: string; evidence: SpotEvidence }[] {
  const facts = card.availability;
  if (!facts) return [];
  const opening = text.availabilityLabel;
  const lines = [
    ...(facts.hours ? [{ label: opening, line: text.hours(facts.hours.open, facts.hours.close), evidence: facts.hours.evidence }] : []),
    ...facts.closedWeekdays.map(({ weekday, scope, evidence }) => ({ label: opening, line: text.closedWeekday(text.weekday[weekday], scope), evidence })),
    ...facts.closedRanges.map(({ from, to, scope, evidence }) => ({ label: opening, line: text.closedRange(from, to, scope), evidence })),
    ...(facts.reservation?.required
      ? [{ label: text.facts.reservation, line: text.booking(facts.reservation.daysAhead), evidence: facts.reservation.evidence }]
      : []),
    ...facts.uncertain.map(({ note, evidence }) => ({ label: opening, line: note, evidence })),
  ];
  return lines.filter((item, index) => lines.findIndex(({ line }) => line === item.line) === index).slice(0, 6);
}

function StopFacts({ card, missing, text, locale }: {
  readonly card: SpotCard;
  readonly missing: readonly SpotFact[];
  readonly text: Copy;
  readonly locale: Locale;
}) {
  const facts = sourcedFacts(card);
  const opening = availabilityLines(card, text);
  // What the second round found answers the first round's open questions about opening and booking.
  const stillMissing = missing.filter((fact) => !(card.availability && (
    (fact === "opening" && (card.availability.hours || card.availability.closedWeekdays.length > 0))
    || (fact === "reservation" && card.availability.reservation))));
  const sources = [
    ...(card.location ? [{ key: "location", label: text.facts.location, evidence: card.location }] : []),
    ...facts.map(({ fact, evidence }) => ({ key: fact, label: text.facts[fact], evidence })),
    ...opening.map(({ label, line, evidence }) => ({ key: `opening-${line}`, label, evidence })),
  ];
  return (
    <>
      {facts.length > 0 || opening.length > 0 ? (
        <dl className={draftStyles.facts}>
          {facts.map(({ fact, evidence }) => (
            <div key={fact}><dt>{text.facts[fact]}</dt><dd>{evidence.quote}</dd></div>
          ))}
          {opening.map(({ label, line }) => (
            <div key={line}><dt>{label}</dt><dd>{line}</dd></div>
          ))}
        </dl>
      ) : null}
      <div className={draftStyles.stopMeta}>
        {stillMissing.length > 0 ? (
          <span className={draftStyles.toCheck}>{text.unverified(stillMissing.map((fact) => text.facts[fact]).join(locale === "zh" ? "、" : ", "))}</span>
        ) : null}
        {sources.length > 0 ? (
          <details className={draftStyles.sources}>
            <summary>{text.sources(sources.length)}</summary>
            <ul>
              {sources.map(({ key, label, evidence }) => (
                <li key={key}>
                  <span className={draftStyles.sourceFact}>{label}</span>
                  <q>{evidence.quote}</q>
                  <a href={evidence.url} target="_blank" rel="noopener noreferrer">
                    {sourceHost(evidence.url)} · {text.checked(checkedDate(evidence, locale))}
                    <ExternalLink aria-hidden="true" size={11} />
                  </a>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </>
  );
}

/** The day's photo with what it shows and who took it; a credit opens its source after asking. */
function DayPhoto({ photo }: { readonly photo: PlaceImage }) {
  const href = creditsHref(photo.url);
  return (
    <figure className={draftStyles.banner}>
      <Image src={photo.url} alt={photo.caption} fill sizes="(max-width: 900px) 100vw, 720px" />
      <figcaption>
        <span>{photo.caption}</span>
        {photo.credit && href ? <PhotoSourceCredit className={draftStyles.bannerCredit} href={href} image={photo} /> : null}
      </figcaption>
    </figure>
  );
}

/** The cities in route order with their days; hovering a city shows why it got them. */
function RouteStrip({ route, text }: {
  readonly route: PlanRoute;
  readonly text: Copy;
}) {
  return (
    <div className={draftStyles.route} aria-label={text.routeTitle}>
      <Route aria-hidden="true" size={15} className={draftStyles.routeIcon} />
      <ol>
        {route.cities.map(({ city, days, reason }, index) => (
          <li key={city} title={reason ?? undefined}>
            {index > 0 ? <ArrowRight aria-hidden="true" size={13} className={draftStyles.routeArrow} /> : null}
            <span className={draftStyles.routeCity}>{city}</span>
            <span className={draftStyles.routeDays}>{text.routeDays(days)}</span>
          </li>
        ))}
      </ol>
      {route.source === "fallback" ? <span className={draftStyles.routeFallback}>{text.routeFallback}</span> : null}
    </div>
  );
}
