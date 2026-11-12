"use client";

import { ChevronDown, Clock, ExternalLink, Info, MoonStar, RotateCw, Sparkles, Star, Sun, Sunrise, TriangleAlert } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

import { useLocale } from "@/components/i18n/locale-context";
import { creditsHref } from "@/components/trip-workspace/destination-choices-card";
import { PhotoSourceCredit } from "@/components/trip-workspace/photo-source-dialog";
import type { PlaceImage } from "@/domain/location/place-image";
import type { Locale } from "@/domain/locale/locale";
import type { DaySlot, PlanDay, SpotFact } from "@/domain/plan/plan-draft";
import type { PlanDraftResponse } from "@/domain/plan/plan-draft-response";
import type { PlanHandoff } from "@/domain/plan/plan-handoff";
import type { SpotCard, SpotEvidence } from "@/domain/plan/spot-card";

import {
  PlanDraftRequestError,
  readPlanDraft,
  requestPlanDraft,
  savePlanDraft,
  sourceHost,
  sourcedFacts,
  stopsBySlot,
  type PlanDraftFailure,
} from "./plan-draft-model";
import draftStyles from "./plan-draft.module.css";
import styles from "./trip-plan.module.css";

const copy = {
  en: {
    working: "Meri is researching spots and arranging your days",
    workingHint: "This usually takes 30 to 60 seconds. You can stay on this page.",
    preview: "Preview day",
    dayLabel: (day: number) => `Day ${day}`,
    stopCount: (count: number) => `${count} ${count === 1 ? "stop" : "stops"}`,
    slots: { morning: "Morning", afternoon: "Afternoon", evening: "Evening" } satisfies Record<DaySlot, string>,
    requested: "You chose this",
    facts: { location: "Location", opening: "Opening", reservation: "Booking", setting: "Setting", walking: "Walking", suggestedDuration: "Time to allow" } satisfies Record<SpotFact, string>,
    unverified: (fields: string) => `To check: ${fields}`,
    sources: (count: number) => `${count} ${count === 1 ? "source" : "sources"}`,
    checked: (date: string) => `checked ${date}`,
    summary: { days: "days", stops: "stops", sourced: "with sources", conflicts: "to resolve" },
    conflictsTitle: "Couldn’t fit everything",
    requestedUnscheduled: (name: string) => `${name} isn’t in the plan yet.`,
    notEnough: (day: number) => `Day ${day} has no spots yet: research found too few candidates.`,
    researchPartial: (cities: string) => `Some research for ${cities} didn’t finish, so there may be fewer options.`,
    pendingProvinces: (provinces: string) => `${provinces}: choose a city to include it.`,
    multipleCities: "Splitting days across several cities is still being built. For now, plan one city or leave the length open for a preview day.",
    noCity: "Choose a city in your journey to start planning.",
    failed: {
      journey_changed: "Your journey changed after this plan was opened. Go back and choose Generate plan again.",
      unavailable: "The planner is busy right now. Try again in a moment.",
      failed: "Meri couldn’t arrange the days this time.",
    } satisfies Record<PlanDraftFailure, string>,
    retry: "Try again",
  },
  zh: {
    working: "Meri 正在调研景点、安排每一天",
    workingHint: "通常需要 30 到 60 秒，可以留在这一页等待。",
    preview: "示范日",
    dayLabel: (day: number) => `第 ${day} 天`,
    stopCount: (count: number) => `${count} 个景点`,
    slots: { morning: "上午", afternoon: "下午", evening: "晚上" } satisfies Record<DaySlot, string>,
    requested: "你点名的",
    facts: { location: "位置", opening: "开放", reservation: "预约", setting: "室内外", walking: "步行", suggestedDuration: "建议停留" } satisfies Record<SpotFact, string>,
    unverified: (fields: string) => `待核实：${fields}`,
    sources: (count: number) => `${count} 条出处`,
    checked: (date: string) => `${date} 查询`,
    summary: { days: "天", stops: "个景点", sourced: "有出处", conflicts: "待处理" },
    conflictsTitle: "有些安排没排进去",
    requestedUnscheduled: (name: string) => `${name}还没排进行程。`,
    notEnough: (day: number) => `第 ${day} 天暂时空着：调研到的候选不够。`,
    researchPartial: (cities: string) => `${cities}的部分调研没有完成，候选可能偏少。`,
    pendingProvinces: (provinces: string) => `${provinces}：选定城市后才会纳入规划。`,
    multipleCities: "多城市分天还在开发中。目前可以只规划一个城市，或者不定天数先看示范日。",
    noCity: "请先在旅程里选定城市再规划。",
    failed: {
      journey_changed: "打开计划后旅程有了变化。请回到旅程，再点一次 Generate plan。",
      unavailable: "规划服务暂时繁忙，请稍后再试。",
      failed: "这次没能排好行程。",
    } satisfies Record<PlanDraftFailure, string>,
    retry: "重试",
  },
} as const;

type Copy = (typeof copy)[Locale];

type DraftState =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly response: PlanDraftResponse }
  | { readonly kind: "failed"; readonly reason: PlanDraftFailure };

// Research costs searches and model calls, so a remount (or React's development double
// effect) joins the request already running instead of starting another.
const inFlight = new Map<string, Promise<PlanDraftResponse>>();

function draftFor(tripId: string, handoff: PlanHandoff): Promise<PlanDraftResponse> {
  const key = tripId + JSON.stringify(handoff);
  const running = inFlight.get(key);
  if (running) return running;
  const request = requestPlanDraft(tripId, handoff, new AbortController().signal)
    .finally(() => inFlight.delete(key));
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

/** The drafted days, fetched once per handoff and kept in this tab. */
export function PlanDraftSection({ tripId, handoff }: { readonly tripId: string; readonly handoff: PlanHandoff }) {
  const locale = useLocale();
  const text = copy[locale];
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<DraftState>(() => {
    const stored = readPlanDraft(tripId, handoff);
    return stored ? { kind: "ready", response: stored } : { kind: "loading" };
  });

  useEffect(() => {
    if (state.kind !== "loading") return;
    let active = true;
    draftFor(tripId, handoff)
      .then((response) => {
        savePlanDraft(tripId, handoff, response);
        if (active) setState({ kind: "ready", response });
      })
      .catch((error: unknown) => {
        if (active) setState({ kind: "failed", reason: error instanceof PlanDraftRequestError ? error.reason : "failed" });
      });
    return () => { active = false; };
  }, [attempt, handoff, state.kind, tripId]);

  if (state.kind === "loading") return <DraftLoading text={text} />;
  if (state.kind === "failed") {
    return (
      <section className={draftStyles.notice} data-tone="error" role="alert">
        <TriangleAlert aria-hidden="true" size={18} />
        <div>
          <p>{text.failed[state.reason]}</p>
          {state.reason === "journey_changed" ? null : (
            <button type="button" className={draftStyles.retry}
              onClick={() => { setState({ kind: "loading" }); setAttempt(attempt + 1); }}>
              <RotateCw aria-hidden="true" size={14} />{text.retry}
            </button>
          )}
        </div>
      </section>
    );
  }
  const { response } = state;
  if (response.status === "unsupported") {
    return (
      <section className={draftStyles.notice} role="status">
        <Info aria-hidden="true" size={18} />
        <p>{response.reason === "multiple_cities" ? text.multipleCities : text.noCity}</p>
      </section>
    );
  }
  return <DraftDays response={response} text={text} locale={locale} />;
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
      {[0, 1].map((index) => (
        <div key={index} className={draftStyles.skeletonCard} aria-hidden="true">
          <span className={draftStyles.skeletonBadge} />
          <span className={draftStyles.skeletonLines}><span /><span /></span>
        </div>
      ))}
    </section>
  );
}

function DraftDays({ response, text, locale }: {
  readonly response: Extract<PlanDraftResponse, { status: "ready" }>;
  readonly text: Copy;
  readonly locale: Locale;
}) {
  const { draft } = response;
  const cards = useMemo(() => new Map(response.spots.map((card) => [card.id, card])), [response.spots]);
  const photos = useMemo(() => new Map(response.dayPhotos.map(({ day, image }) => [day, image])), [response.dayPhotos]);
  const [openDay, setOpenDay] = useState<number | null>(draft.days[0]?.day ?? null);
  const stops = draft.days.reduce((count, day) => count + day.stops.length, 0);
  const sourced = draft.days.flatMap((day) => day.stops).filter(({ spotId }) => cards.get(spotId)?.location).length;
  const partial = response.cities.filter(({ status }) => status === "partial" || status === "unavailable").map(({ city }) => city);
  const nameOf = (spotId: string) => cards.get(spotId)?.name ?? spotId;

  return (
    <section className={draftStyles.draft} aria-label={text.dayLabel(1)}>
      <dl className={draftStyles.summary}>
        <div><dt>{text.summary.days}</dt><dd>{draft.days.length}</dd></div>
        <div><dt>{text.summary.stops}</dt><dd>{stops}</dd></div>
        <div><dt>{text.summary.sourced}</dt><dd>{sourced}/{stops}</dd></div>
        {draft.conflicts.length > 0 ? (
          <div data-tone="warn"><dt>{text.summary.conflicts}</dt><dd>{draft.conflicts.length}</dd></div>
        ) : null}
      </dl>

      {draft.conflicts.length > 0 ? (
        <div className={draftStyles.notice} data-tone="warn">
          <TriangleAlert aria-hidden="true" size={18} />
          <div>
            <p className={draftStyles.noticeTitle}>{text.conflictsTitle}</p>
            <ul>
              {draft.conflicts.map((conflict) => (
                <li key={conflict.kind === "requested_unscheduled" ? conflict.spotId : `day-${conflict.day}`}>
                  {conflict.kind === "requested_unscheduled" ? text.requestedUnscheduled(nameOf(conflict.spotId)) : text.notEnough(conflict.day)}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      <div className={draftStyles.days}>
        {draft.days.map((day, index) => (
          <DraftDay key={day.day} day={day} cards={cards} text={text} locale={locale} index={index} photo={photos.get(day.day) ?? null}
            preview={draft.mode === "preview"}
            unverified={new Map(draft.unverified.map(({ spotId, fields }) => [spotId, fields]))}
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

const slotIcon = { morning: Sunrise, afternoon: Sun, evening: MoonStar } satisfies Record<DaySlot, typeof Sun>;

function DraftDay({ day, cards, unverified, text, locale, preview, open, onOpen, index, photo }: {
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
  const title = day.stops.map(({ spotId }) => cards.get(spotId)?.name ?? spotId).join(" · ");

  return (
    <motion.article className={styles.dayCard} data-open={open} aria-labelledby={headingId}
      initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: reduce ? 0 : index * 0.06, ease: [0.22, 1, 0.36, 1] }}>
      <button type="button" className={styles.dayHeader} aria-expanded={open} onClick={onOpen}>
        <span className={styles.dayNumber}>{day.day}</span>
        <span className={styles.dayHeading}>
          <span className={styles.dayMeta}>
            {text.dayLabel(day.day)}{day.date ? ` · ${formatDate(day.date, locale)}` : ""} · {day.city}
            {preview ? <span className={draftStyles.previewTag}>{text.preview}</span> : null}
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
                        return (
                          <li key={stop.spotId} className={draftStyles.stop}>
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

function StopFacts({ card, missing, text, locale }: {
  readonly card: SpotCard;
  readonly missing: readonly SpotFact[];
  readonly text: Copy;
  readonly locale: Locale;
}) {
  const facts = sourcedFacts(card);
  const sources = [...(card.location ? [{ fact: "location" as const, evidence: card.location }] : []), ...facts];
  return (
    <>
      {facts.length > 0 ? (
        <dl className={draftStyles.facts}>
          {facts.map(({ fact, evidence }) => (
            <div key={fact}><dt>{text.facts[fact]}</dt><dd>{evidence.quote}</dd></div>
          ))}
        </dl>
      ) : null}
      <div className={draftStyles.stopMeta}>
        {missing.length > 0 ? (
          <span className={draftStyles.toCheck}>{text.unverified(missing.map((fact) => text.facts[fact]).join(locale === "zh" ? "、" : ", "))}</span>
        ) : null}
        {sources.length > 0 ? (
          <details className={draftStyles.sources}>
            <summary>{text.sources(sources.length)}</summary>
            <ul>
              {sources.map(({ fact, evidence }) => (
                <li key={fact}>
                  <span className={draftStyles.sourceFact}>{text.facts[fact]}</span>
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
