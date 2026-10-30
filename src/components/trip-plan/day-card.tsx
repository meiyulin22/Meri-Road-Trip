"use client";

import { BedDouble, Car, Check, ChevronDown, Cloud, CloudRain, CloudSun, Footprints, Lock, Sun, Utensils } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Image from "next/image";

import { useLocale, useMessages } from "@/components/i18n/locale-context";

import { duration, type PlanDay, type Sky } from "./plan-view";
import styles from "./trip-plan.module.css";

const skyIcon: Record<Sky, typeof Sun> = { sunny: Sun, cloudy: CloudSun, overcast: Cloud, rain: CloudRain };

/**
 * One day of the plan. Open, it is the whole day as a timeline: each stop with its time,
 * opening hours and where they were checked, the drive or walk between stops, whether the
 * day is doable before sunset, what is still unknown, and where to sleep. Closed, it is
 * one line, and opening it also moves the map to that day.
 */
export function DayCard({ day, date, open, onOpen, weatherKnown, pricesKnown, onHighlight }: {
  readonly day: PlanDay;
  /** Null until the start date is known. */
  readonly date: string | null;
  readonly open: boolean;
  readonly onOpen: () => void;
  readonly weatherKnown: boolean;
  readonly pricesKnown: boolean;
  readonly onHighlight: (stop: string | null) => void;
}) {
  const locale = useLocale();
  const text = useMessages().plan;
  const reduce = useReducedMotion() ?? false;
  const SkyIcon = skyIcon[day.weather.morning];
  const sights = day.stops.filter((stop) => stop.kind === "sight").length;
  const headingId = `plan-day-${day.day}`;

  return (
    <article className={styles.dayCard} data-open={open} aria-labelledby={headingId}>
      <button type="button" className={styles.dayHeader} aria-expanded={open} onClick={onOpen}>
        <span className={styles.dayNumber}>{day.day}</span>
        <span className={styles.dayHeading}>
          <span className={styles.dayMeta}>
            {text.dayLabel(day.day)}{date ? ` · ${text.dayDate(date)}` : ""} · {locale === "zh" ? day.city : day.cityEn}
          </span>
          <span className={styles.dayTitle} id={headingId}>{day.title[locale]}</span>
        </span>
        <span className={styles.dayAside}>
          {weatherKnown ? (
            <span className={styles.weatherBadge}>
              <SkyIcon aria-hidden="true" size={15} />
              {day.weather.low}°–{day.weather.high}°
            </span>
          ) : null}
          {open ? null : <span className={styles.daySights}>{sights} · {text.kinds.sight}</span>}
          <ChevronDown aria-hidden="true" size={18} className={styles.dayChevron} />
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="body"
            className={styles.dayBody}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.32, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className={styles.dayPhoto}>
              <Image src={`/photos/${day.photo.file}`} alt="" fill sizes="(max-width: 900px) 100vw, 640px" />
              <span>{text.photoBy(day.photo.artist)}</span>
            </div>
            <div className={styles.dayWeatherRow}>
              {weatherKnown ? (
                <>
                  <WeatherHalf label={text.morning} sky={day.weather.morning} />
                  <WeatherHalf label={text.afternoon} sky={day.weather.afternoon} />
                  <span className={styles.weatherRange}>{day.weather.low}° / {day.weather.high}°</span>
                </>
              ) : (
                <span className={styles.lockedLine}><Lock aria-hidden="true" size={13} />{text.weatherLocked}</span>
              )}
            </div>
            <ol className={styles.timeline}>
              {day.stops.map((stop, index) => {
                const leg = day.legs[index];
                const LegIcon = leg?.mode === "walk" ? Footprints : Car;
                return (
                  <li key={stop.id} className={styles.stop} data-kind={stop.kind}
                    onMouseEnter={() => onHighlight(stop.id)} onMouseLeave={() => onHighlight(null)}>
                    <div className={styles.stopRow}>
                      <time className={styles.stopTime}>{stop.time}</time>
                      <span className={styles.stopDot} aria-hidden="true">
                        {stop.kind === "meal" ? <Utensils size={12} /> : stop.kind === "stay" ? <BedDouble size={12} /> : null}
                      </span>
                      <div className={styles.stopContent}>
                        <h3>
                          {stop.name}
                          {locale === "en" ? <span className={styles.stopNameEn}>{stop.nameEn}</span> : null}
                          {stop.kind === "sight" ? null : <span className={styles.stopKind}>{text.kinds[stop.kind]}</span>}
                        </h3>
                        {stop.hours ? (
                          <p className={styles.stopHours}>
                            {stop.hours.text[locale]}
                            {stop.hours.verification.state === "verified" ? (
                              <span className={styles.verified}><Check aria-hidden="true" size={12} />{text.checked}</span>
                            ) : (
                              <span className={styles.unverified}>?{" "}{text.notFound}</span>
                            )}
                          </p>
                        ) : null}
                        {stop.hours ? (
                          <p className={styles.stopSource}>
                            {stop.hours.verification.state === "verified"
                              ? text.source(stop.hours.verification.source[locale], stop.hours.verification.checkedAt)
                              : stop.hours.verification.reason[locale]}
                          </p>
                        ) : null}
                        {stop.note ? <p className={styles.stopNote}>{stop.note[locale]}</p> : null}
                        {stop.alternatives ? (
                          <p className={styles.alternatives}>
                            {text.picked(stop.name)}
                            {stop.alternatives.map((name) => <button type="button" key={name}>{name}</button>)}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    {leg ? (
                      <p className={styles.leg}>
                        <LegIcon aria-hidden="true" size={13} />
                        {text.legModes[leg.mode]} {duration(leg.minutes, text.units)} · {leg.km} {text.units.km}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ol>
            <div className={styles.feasible}>
              <Check aria-hidden="true" size={15} />
              <span>{text.feasible(duration(day.feasibility.roadMinutes, text.units), day.feasibility.endsAt, day.feasibility.sunset)}</span>
            </div>
            {day.unknowns.length > 0 ? (
              <div className={styles.unknowns}>
                <h4>{text.unknownsTitle}</h4>
                <ul>{day.unknowns.map((item) => <li key={item.zh}>{item[locale]}</li>)}</ul>
              </div>
            ) : null}
            {day.stay.hotels.length > 0 ? (
              <div className={styles.stay}>
                <h4><BedDouble aria-hidden="true" size={15} />{text.stayTitle}</h4>
                <p>{day.stay.area[locale]}</p>
                {pricesKnown ? (
                  <ul>
                    {day.stay.hotels.map((hotel) => (
                      <li key={hotel.name}>
                        <span>{hotel.name}</span>
                        <span className={styles.hotelRating}>{hotel.rating.toFixed(1)}</span>
                        <span className={styles.hotelPrice}>{text.fromPrice(hotel.price)} <small>{text.perNight}</small></span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.lockedLine}><Lock aria-hidden="true" size={13} />{text.staysLocked}</p>
                )}
              </div>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </article>
  );
}

function WeatherHalf({ label, sky }: { readonly label: string; readonly sky: Sky }) {
  const text = useMessages().plan;
  const Icon = skyIcon[sky];
  return <span className={styles.weatherHalf}><Icon aria-hidden="true" size={15} />{label} {text.sky[sky]}</span>;
}
