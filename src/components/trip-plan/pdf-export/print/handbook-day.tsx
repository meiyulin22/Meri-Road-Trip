import type { Locale } from "@/domain/locale/locale";
import type { DayOutfit } from "@/domain/plan/outfit";
import type { PlanDay, PlanDraft, PlanStop, StopCheck } from "@/domain/plan/plan-draft";
import type { ReadyPlan } from "@/domain/plan/plan-draft-response";
import type { SpotCard } from "@/domain/plan/spot-card";
import type { TransportPreference } from "@/domain/trip-draft/trip-draft";

import { sourceHost, stopsBySlot } from "../../plan-draft-model";
import { legText } from "../../plan-leg-text";
import { outfitNotes, slotEntries } from "../../plan-outfit-view";
import { transferEnds, transferLabel } from "../../plan-transfer-text";
import { DayWeatherLine, StopWeatherLine } from "../../plan-weather";
import { dayWeather, stopWeather } from "../../plan-weather-view";
import { DayPhoto, sourceLink } from "./handbook-photos";
import styles from "./handbook.module.css";

const copy = {
  zh: {
    day: (day: number) => `第 ${day} 天`,
    outfit: "今日穿搭",
    unavailable: "这一天没有已保存的穿搭建议。",
    emptyDay: "这一天尚未安排景点。",
    slots: { morning: "上午", afternoon: "下午", evening: "晚上" },
    check: { open: "当天开放", partial: "部分关闭", closed: "当天关闭", uncertain: "开放待确认" },
    booking: (days: number | null) => days === null ? "需预约" : `需预约 · 提前 ${days} 天`,
    hours: (open: string, close: string) => `${open} 至 ${close} 开放`,
    weekdays: ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"],
    closed: (when: string, scope: string | null) => `${when}关闭${scope ? `（${scope}）` : ""}`,
    moved: (day: number) => `从第 ${day} 天换来`,
    pending: "待核实",
    opening: "开放",
    reservation: "预约",
    unlocated: "位置未核实",
    transfer: "转场",
    travelLink: "查看往返与转场",
  },
  en: {
    day: (day: number) => `Day ${day}`,
    outfit: "What to wear",
    unavailable: "There is no saved outfit for this day.",
    emptyDay: "No stops are scheduled for this day yet.",
    slots: { morning: "Morning", afternoon: "Afternoon", evening: "Evening" },
    check: { open: "Open that day", partial: "Partly closed", closed: "Closed that day", uncertain: "Opening to confirm" },
    booking: (days: number | null) => days === null ? "Booking needed" : `Book ${days} ${days === 1 ? "day" : "days"} ahead`,
    hours: (open: string, close: string) => `Open ${open} to ${close}`,
    weekdays: ["", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"],
    closed: (when: string, scope: string | null) => `Closed ${when}${scope ? ` (${scope})` : ""}`,
    moved: (day: number) => `Moved from day ${day}`,
    pending: "To check",
    opening: "Opening",
    reservation: "Booking",
    unlocated: "Location unverified",
    transfer: "Transfer",
    travelLink: "See travel details",
  },
} as const;

export function bookingText(days: number | null, locale: Locale): string {
  return copy[locale].booking(days);
}

export function dayLabel(day: number, locale: Locale): string {
  return copy[locale].day(day);
}

function Outfit({ outfit, locale }: { readonly outfit: DayOutfit | undefined; readonly locale: Locale }) {
  const text = copy[locale];
  return (
    <section className={styles.outfit}>
      <h3>{text.outfit}</h3>
      {outfit ? (
        <>
          <dl className={styles.outfitList}>
            {slotEntries(outfit, locale).flatMap(({ entries }) => entries).map(({ key, name, reasons }) => (
              <div key={key}><dt>{name}</dt><dd>{reasons.join(locale === "zh" ? "、" : "; ")}</dd></div>
            ))}
          </dl>
          {outfitNotes(outfit, locale).map((note, index) => <p key={index}>{note}</p>)}
        </>
      ) : <p>{text.unavailable}</p>}
    </section>
  );
}

function StopOpening({ card, draft, locale }: { readonly card: SpotCard; readonly draft: PlanDraft; readonly locale: Locale }) {
  const text = copy[locale];
  const availability = card.availability;
  const booking = availability?.reservation;
  const lines = [
    ...(availability?.hours ? [{ label: text.opening, line: text.hours(availability.hours.open, availability.hours.close), evidence: availability.hours.evidence }]
      : card.opening ? [{ label: text.opening, line: card.opening.quote, evidence: card.opening }] : []),
    ...(availability?.closedWeekdays.map(({ weekday, scope, evidence }) => ({ label: text.opening, line: text.closed(text.weekdays[weekday], scope), evidence })) ?? []),
    ...(availability?.closedRanges.map(({ from, to, scope, evidence }) => ({ label: text.opening, line: text.closed(`${from} – ${to}`, scope), evidence })) ?? []),
    ...(booking?.required ? [{ label: text.reservation, line: text.booking(booking.daysAhead), evidence: booking.evidence }]
      : !booking && card.reservation ? [{ label: text.reservation, line: card.reservation.quote, evidence: card.reservation }] : []),
    ...(availability?.uncertain.map(({ note, evidence }) => ({ label: text.opening, line: note, evidence })) ?? []),
  ];
  const missing = draft.unverified.find(({ spotId }) => spotId === card.id)?.fields ?? [];
  const pending = [
    missing.includes("opening") && !availability?.hours && !availability?.closedWeekdays.length ? text.opening : null,
    missing.includes("reservation") && !availability?.reservation ? text.reservation : null,
  ].filter(Boolean);
  return (
    <>
      {lines.length ? (
        <dl className={styles.facts}>
          {lines.filter(({ line }, index) => lines.findIndex((entry) => entry.line === line) === index).map(({ label, line, evidence }) => (
            <div key={line}>
              <dt>{label}</dt>
              <dd>{line} <a className={styles.source} href={sourceLink(evidence.url)}>{sourceHost(evidence.url)}</a></dd>
            </div>
          ))}
        </dl>
      ) : null}
      {pending.length ? <p className={styles.muted}>{text.pending} · {pending.join(locale === "zh" ? "、" : ", ")}</p> : null}
    </>
  );
}

function StopChecks({ check, locale }: { readonly check: StopCheck | undefined; readonly locale: Locale }) {
  if (!check) return null;
  const text = copy[locale];
  const labels = [
    check.status !== "unchecked" ? text.check[check.status] : null,
    check.reservation ? text.booking(check.reservation.daysAhead) : null,
    check.movedFrom !== null ? text.moved(check.movedFrom) : null,
  ].filter(Boolean);
  return labels.length ? <p className={styles.checks}>{labels.join(" · ")}</p> : null;
}

function DailyStop({ stop, day, draft, cards, cityCards, locale, transport }: {
  readonly stop: PlanStop;
  readonly day: PlanDay;
  readonly draft: PlanDraft;
  readonly cards: ReadonlyMap<string, SpotCard>;
  readonly cityCards: readonly SpotCard[];
  readonly locale: Locale;
  readonly transport: TransportPreference | null;
}) {
  const card = cards.get(stop.spotId);
  const previous = day.stops[day.stops.indexOf(stop) - 1];
  const leg = previous && draft.legs?.find(({ day: number, fromSpotId, toSpotId }) => number === day.day && fromSpotId === previous.spotId && toSpotId === stop.spotId);
  const check = draft.checks?.find(({ day: number, spotId }) => number === day.day && spotId === stop.spotId);
  return (
    <li className={styles.stop}>
      {leg ? <p className={styles.arrival}>{legText(leg, transport, locale, { from: cards.get(leg.fromSpotId)?.name ?? leg.fromSpotId, to: card?.name ?? stop.spotId })}</p> : null}
      <h4>{stop.anchor ? <span className={styles.anchor}>{stop.anchor.time}</span> : null}{card?.name ?? stop.spotId}</h4>
      {stop.anchor ? <p>{stop.anchor.reason} <a className={styles.source} href={sourceLink(stop.anchor.evidence.url)}>{sourceHost(stop.anchor.evidence.url)}</a></p> : null}
      <StopChecks check={check} locale={locale} />
      {card ? (
        <>
          <StopWeatherLine line={stopWeather(card, day.date, cityCards)} locale={locale} />
          {card.mapCheck.status !== "located" ? <p className={styles.muted}>{copy[locale].unlocated}</p> : null}
          <StopOpening card={card} draft={draft} locale={locale} />
        </>
      ) : null}
    </li>
  );
}

export function HandbookDay({ day, plan, cards, locale, transport }: {
  readonly day: PlanDay;
  readonly plan: ReadyPlan;
  readonly cards: ReadonlyMap<string, SpotCard>;
  readonly locale: Locale;
  readonly transport: TransportPreference | null;
}) {
  const { draft } = plan;
  const text = copy[locale];
  const cityCards = plan.spots.filter(({ province, city }) => province === day.province && city === day.city);
  const photo = plan.dayPhotos.find(({ day: number }) => number === day.day)?.image;
  const transfers = (draft.transfers ?? []).filter(({ day: number }) => number === day.day);
  return (
    <section className={styles.page} id={`meri-day-${day.day}`}>
      <header className={styles.sectionHead}>
        <p className={styles.kicker}>{dayLabel(day.day, locale)}{day.date ? ` · ${day.date}` : ""}</p>
        <h2>{day.city}</h2>
        {day.theme ? <p className={styles.subtitle}>{day.theme}</p> : null}
        <DayWeatherLine view={dayWeather(day, cityCards)} locale={locale} />
      </header>
      {photo ? <DayPhoto photo={photo} locale={locale} /> : null}
      <Outfit outfit={draft.outfits?.find(({ day: number }) => number === day.day)} locale={locale} />
      {transfers.length ? (
        <ul className={styles.dayTransfers}>
          {transfers.map((leg) => {
            const { from, to } = transferEnds(leg, locale);
            return <li key={leg.kind}>{transferLabel(leg.kind, locale)} · {from} → {to} <a href="#meri-travel">{text.travelLink}</a></li>;
          })}
        </ul>
      ) : day.arrivingFrom ? <p className={styles.dayTransfers}>{text.transfer} · {day.arrivingFrom} → {day.city}</p> : null}
      {stopsBySlot(day).map(({ slot, stops }) => (
        <section key={slot} className={styles.slot}>
          <h3>{text.slots[slot]}</h3>
          <ol>{stops.map((stop) => (
            <DailyStop key={stop.spotId} stop={stop} day={day} draft={draft} cards={cards} cityCards={cityCards} locale={locale} transport={transport} />
          ))}</ol>
        </section>
      ))}
      {day.stops.length ? null : <p className={styles.muted}>{text.emptyDay}</p>}
    </section>
  );
}
