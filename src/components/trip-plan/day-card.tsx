"use client";

import { BedDouble, Car, Check, ChevronDown, Cloud, CloudRain, CloudSun, Footprints, Lock, Navigation, Sun, Sunrise, Sunset, Utensils, Wind } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import { useLocale, useMessages } from "@/components/i18n/locale-context";

import { navigationLinks } from "./plan-actions";
import { duration, type PlanDay, type PlanStop, type Sky } from "./plan-view";
import styles from "./trip-plan.module.css";

const skyIcon: Record<Sky, typeof Sun> = { sunny: Sun, cloudy: CloudSun, overcast: Cloud, rain: CloudRain };

/**
 * One day of the plan. Open, it is the whole day as a timeline: each stop with its time,
 * opening hours and where they were checked, the drive or walk between stops, whether the
 * day is doable before sunset, what is still unknown, and where to sleep. Closed, it is
 * one line, and opening it also moves the map to that day.
 */
export function DayCard({ day, date, open, onOpen, weather, pricesKnown, onHighlight }: {
  readonly day: PlanDay;
  /** Null until the start date is known. */
  readonly date: string | null;
  readonly open: boolean;
  readonly onOpen: () => void;
  /** A forecast, the usual weather for the season when the day is too far ahead, or nothing before the date is known. */
  readonly weather: "forecast" | "climate" | null;
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
          {weather ? (
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
            <DayWeather day={day} kind={weather} />
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
                          <span className={styles.stopName}>{stop.name}</span>
                          {locale === "en" ? <span className={styles.stopNameEn}>{stop.nameEn}</span> : null}
                          {stop.kind === "sight" ? null : <span className={styles.stopKind}>{text.kinds[stop.kind]}</span>}
                          <NavigateMenu stop={stop} />
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

/**
 * The day's weather. A forecast shows morning and afternoon, a few hours through the day,
 * wind, sunrise and sunset, and why the day is arranged as it is when the weather decided
 * it. Too far ahead it shows the usual weather for the season and says so.
 */
function DayWeather({ day, kind }: { readonly day: PlanDay; readonly kind: "forecast" | "climate" | null }) {
  const locale = useLocale();
  const text = useMessages().plan;
  if (kind === null) {
    return <div className={styles.dayWeather}><span className={styles.lockedLine}><Lock aria-hidden="true" size={13} />{text.weatherLocked}</span></div>;
  }
  const weather = day.weather;
  return (
    <div className={styles.dayWeather} data-kind={kind}>
      <div className={styles.weatherTop}>
        <span className={styles.weatherKind}>{kind === "forecast" ? text.forecast : text.climate}</span>
        <WeatherHalf label={text.morning} sky={weather.morning} />
        <WeatherHalf label={text.afternoon} sky={weather.afternoon} />
        <span className={styles.weatherRange}>{weather.low}° / {weather.high}°</span>
      </div>
      {kind === "forecast" ? (
        <>
          <ol className={styles.hourly}>
            {weather.hours.map((hour) => {
              const Icon = skyIcon[hour.sky];
              return (
                <li key={hour.time}>
                  <span>{hour.time}</span>
                  <Icon aria-label={text.sky[hour.sky]} size={16} />
                  <strong>{hour.temp}°</strong>
                </li>
              );
            })}
          </ol>
          <p className={styles.weatherFacts}>
            <span><Wind aria-hidden="true" size={13} />{text.wind(weather.wind)}</span>
            <span><Sunrise aria-hidden="true" size={13} />{text.sunrise(weather.sunrise)}</span>
            <span><Sunset aria-hidden="true" size={13} />{text.sunset(day.feasibility.sunset)}</span>
          </p>
          {weather.reason ? <p className={styles.weatherReason}><CloudSun aria-hidden="true" size={15} />{weather.reason[locale]}</p> : null}
        </>
      ) : (
        <p className={styles.weatherClimate}>{text.climateNote}</p>
      )}
    </div>
  );
}

/** Open a stop in the traveller's own map app: links only, nothing is called from Meri. */
function NavigateMenu({ stop }: { readonly stop: PlanStop }) {
  const locale = useLocale();
  const text = useMessages().plan;
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!box.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", escape); };
  }, [open]);

  return (
    <span className={styles.navigate} ref={box}>
      <button type="button" aria-label={text.navigateTo(stop.name)} title={text.navigate} aria-expanded={open}
        onClick={() => setOpen(!open)}>
        <Navigation aria-hidden="true" size={13} />
      </button>
      {open ? (
        <span className={styles.navigateMenu} role="menu">
          {navigationLinks(stop, locale).map((link) => (
            <a key={link.app} role="menuitem" href={link.url} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>
              {text.mapApps[link.app]}
            </a>
          ))}
        </span>
      ) : null}
    </span>
  );
}

function WeatherHalf({ label, sky }: { readonly label: string; readonly sky: Sky }) {
  const text = useMessages().plan;
  const Icon = skyIcon[sky];
  return <span className={styles.weatherHalf}><Icon aria-hidden="true" size={15} />{label} {text.sky[sky]}</span>;
}
