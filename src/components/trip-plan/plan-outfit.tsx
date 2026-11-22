"use client";

import { Backpack, RotateCw, Shirt, Sparkles } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type CSSProperties, useEffect, useMemo, useState, useSyncExternalStore } from "react";

import type { Locale } from "@/domain/locale/locale";
import { type DayOutfit, type OutfitItemId, packingList } from "@/domain/plan/outfit";
import type { PlanDay } from "@/domain/plan/plan-draft";

import {
  artBase, bagSwatch, basePixels, extraSwatch, gridHeight, gridWidth, itemPixels, loadOutfitManifest, type OutfitManifest, type Pixels,
} from "./outfit-art";
import { itemName, outfitNotes, type SlotEntry, slotEntries, slotLabel, thermometerAt } from "./plan-outfit-view";
import { SkyIcon } from "./plan-weather";
import type { DayWeatherView } from "./plan-weather-view";
import styles from "./plan-outfit.module.css";

const copy = {
  zh: {
    title: "每天穿什么",
    subtitle: "按每天的天气给小熊猫换装",
    day: (day: number) => `第 ${day} 天`,
    pick: "点一件装备，看为什么要带它。",
    fromMeri: "Meri 补充",
    fromWeather: "天气要求",
    empty: "空",
    beyond: "日期太远，还没有预报。出发前看了预报再定穿什么。",
    noForecast: "这天没有预报。",
    needDates: "填了出发日期（16 天以内），才能按每天的天气给小熊猫配穿搭。",
    allBeyond: "出发日期离现在超过 16 天，还没有天气预报。出发前两周内再生成一次计划，就能看到每天的穿搭。",
    noWeather: "这次没有查到天气，所以没有穿搭。可以重新查一次，不算一次规划。",
    refresh: "重新查天气",
    refreshing: "正在查天气、配穿搭…",
    refreshFailed: "还是没查到天气，请过一会儿再试。",
    coldest: "最冷",
    warmest: "最暖",
    packTitle: "打包清单",
    packHint: "整趟行程要带的，勾上就算装好了。只存在这台设备上。",
    packed: (done: number, total: number) => `已打包 ${done}/${total}`,
    days: (days: readonly number[]) => `第 ${days.join("、")} 天`,
  },
  en: {
    title: "What to wear each day",
    subtitle: "The red panda dresses for each day's weather",
    day: (day: number) => `Day ${day}`,
    pick: "Tap a piece of kit to see why it's there.",
    fromMeri: "From Meri",
    fromWeather: "Weather",
    empty: "Empty",
    beyond: "Too far ahead for a forecast. Decide what to wear once you've seen it.",
    noForecast: "No forecast for this day.",
    needDates: "Add a start date (within 16 days) and the red panda will dress for each day's weather.",
    allBeyond: "The trip starts more than 16 days from now, beyond the forecast. Make the plan again within two weeks of leaving to see each day's outfit.",
    noWeather: "The weather couldn't be fetched this time, so there are no outfits. You can try again; it doesn't count as a new plan.",
    refresh: "Check the weather again",
    refreshing: "Checking the weather and dressing the days…",
    refreshFailed: "Still no weather. Try again in a little while.",
    coldest: "Coldest",
    warmest: "Warmest",
    packTitle: "Packing list",
    packHint: "Everything the trip needs; tick it once it's packed. Kept on this device only.",
    packed: (done: number, total: number) => `${done}/${total} packed`,
    days: (days: readonly number[]) => `Day ${days.join(", ")}`,
  },
} as const;

type Weather = "rain" | "snow" | "sun" | "wind" | null;

/** The stage's weather from why each thing is worn: storm or rain, snow, gale, strong sun. */
function stageWeather(outfit: DayOutfit): Weather {
  const kinds = new Set(outfit.items.flatMap(({ reasons }) => reasons.map(({ kind }) => kind)));
  if (kinds.has("snow")) return "snow";
  if (kinds.has("storm") || kinds.has("rain")) return "rain";
  if (kinds.has("gale")) return "wind";
  if (kinds.has("sun")) return "sun";
  return null;
}

function PixelLayer({ pixels }: { readonly pixels: Pixels }) {
  return <>{pixels.map(([x, y, width, height, fill], index) => <rect key={index} x={x} y={y} width={width} height={height} fill={fill} />)}</>;
}

/**
 * The red panda in the day's kit. With Codex's art it is the base image with one overlay per
 * item; until then, placeholder pixels. Items arrive one by one, bottom layer first; the chosen
 * one stays bright while the rest dim.
 */
function Doll({ outfit, art, selected, reduce }: {
  readonly outfit: DayOutfit;
  readonly art: OutfitManifest | null;
  readonly selected: OutfitItemId | null;
  readonly reduce: boolean;
}) {
  const worn = outfit.items
    .map(({ id }) => ({ id, art: art?.items[id] ?? null, placeholder: itemPixels[id] }))
    .filter((item) => (art ? item.art !== null : item.placeholder !== null))
    .sort((left, right) => (left.art?.z ?? left.placeholder?.z ?? 0) - (right.art?.z ?? right.placeholder?.z ?? 0));
  const layer = (id: OutfitItemId, index: number) => ({
    initial: reduce ? false : { opacity: 0, y: art ? -24 : -3 },
    animate: { opacity: selected && selected !== id ? 0.35 : 1, y: 0 },
    exit: { opacity: 0 },
    transition: { duration: reduce ? 0 : 0.28, delay: reduce ? 0 : 0.12 + index * 0.09, ease: [0.2, 0.8, 0.2, 1] as const },
  });
  const baseOpacity = selected ? 0.55 : 1;

  if (art) {
    return (
      <div className={styles.dollImages} style={{ aspectRatio: `${art.canvas.width} / ${art.canvas.height}` }} data-pixelated={art.pixelated}>
        {/* Codex's layers share one canvas and are stacked, not laid out, so next/image's sizing does not apply. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={artBase + art.base} alt="" style={{ opacity: baseOpacity }} />
        <AnimatePresence>
          {worn.map(({ id, art: overlay }, index) => overlay ? (
            <motion.img key={`${outfit.day}-${id}`} src={artBase + overlay.file} alt="" {...layer(id, index)} />
          ) : null)}
        </AnimatePresence>
      </div>
    );
  }
  return (
    <svg className={styles.dollPixels} viewBox={`0 0 ${gridWidth} ${gridHeight}`} shapeRendering="crispEdges" aria-hidden="true">
      <rect x={8} y={37} width={16} height={1} fill="rgba(23, 53, 44, .18)" />
      <g style={{ opacity: baseOpacity, transition: "opacity .2s" }}><PixelLayer pixels={basePixels} /></g>
      <AnimatePresence>
        {worn.map(({ id, placeholder }, index) => placeholder ? (
          <motion.g key={`${outfit.day}-${id}`} {...layer(id, index)}><PixelLayer pixels={placeholder.pixels} /></motion.g>
        ) : null)}
      </AnimatePresence>
    </svg>
  );
}

/** Falling pixels for rain or snow, streaks for a gale, a pixel sun; nothing on a plain day. */
function StageWeather({ weather, reduce }: { readonly weather: Weather; readonly reduce: boolean }) {
  if (weather === null) return null;
  if (weather === "sun") return <span className={styles.sun} aria-hidden="true" />;
  const count = weather === "wind" ? 5 : 14;
  return (
    <span className={styles.particles} data-weather={weather} data-still={reduce} aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <i key={index} style={{ "--x": `${(index * 37) % 100}%`, "--delay": `${(index * 0.23) % 1.6}s` } as CSSProperties} />
      ))}
    </span>
  );
}

function swatchOf(entry: SlotEntry): string {
  if (entry.kind === "extra") return extraSwatch;
  return itemPixels[entry.id]?.swatch ?? bagSwatch[entry.id] ?? extraSwatch;
}

/**
 * The plan's dressing room (1.2117 outfit): one red panda, one tab a day, like the map. Choosing
 * a day re-dresses it from the day's weather; the equipment slots list what goes where, and a
 * chosen item says why. It follows the day opened in the itinerary.
 */
export function OutfitRoom({ days, outfits, weatherOf, selectedDay, onSelectDay, locale, onRefreshWeather }: {
  readonly days: readonly PlanDay[];
  readonly outfits: readonly DayOutfit[];
  readonly weatherOf: (day: PlanDay) => DayWeatherView;
  readonly selectedDay: number | null;
  readonly onSelectDay: (day: number) => void;
  readonly locale: Locale;
  /** 「重新查天气」 for a saved plan whose weather was not found (2026-11-22); true when it worked. */
  readonly onRefreshWeather?: () => Promise<boolean>;
}) {
  const text = copy[locale];
  const [refresh, setRefresh] = useState<"idle" | "working" | "failed">("idle");
  const reduce = useReducedMotion() ?? false;
  const [art, setArt] = useState<OutfitManifest | null>(null);
  const [picked, setPicked] = useState<{ day: number; key: string } | null>(null);
  useEffect(() => {
    let live = true;
    void loadOutfitManifest().then((loaded) => { if (live) setArt(loaded); });
    return () => { live = false; };
  }, []);

  const byDay = useMemo(() => new Map(outfits.map((outfit) => [outfit.day, outfit])), [outfits]);
  if (days.length === 0) return null;
  // No outfit at all: say why, so the room is found and its missing piece is clear.
  if (outfits.length === 0) {
    const reason = days.every(({ date }) => date === null) ? text.needDates
      : days.some((day) => weatherOf(day)?.kind === "beyond") ? text.allBeyond : text.noWeather;
    return (
      <section className={styles.room} id="plan-outfit" aria-labelledby="plan-outfit-heading" data-empty="true">
        <header className={styles.roomHeader}>
          <span className={styles.roomIcon}><Shirt aria-hidden="true" size={16} /></span>
          <div>
            <h3 id="plan-outfit-heading">{text.title}</h3>
            <p>{reason}</p>
            {reason === text.noWeather && onRefreshWeather ? (
              <>
                <button type="button" className={styles.refresh} disabled={refresh === "working"} onClick={() => {
                  setRefresh("working");
                  void onRefreshWeather().then((ok) => setRefresh(ok ? "idle" : "failed"));
                }}>
                  <RotateCw aria-hidden="true" size={14} />{refresh === "working" ? text.refreshing : text.refresh}
                </button>
                {refresh === "failed" ? <p role="alert">{text.refreshFailed}</p> : null}
              </>
            ) : null}
          </div>
        </header>
      </section>
    );
  }
  const current = (selectedDay !== null ? days.find(({ day }) => day === selectedDay) : undefined) ?? days.find(({ day }) => byDay.has(day)) ?? days[0];
  const outfit = byDay.get(current.day) ?? null;
  const slots = outfit ? slotEntries(outfit, locale) : [];
  const chosen = picked && picked.day === current.day ? slots.flatMap(({ entries }) => entries).find(({ key }) => key === picked.key) ?? null : null;
  const view = weatherOf(current);

  return (
    <section className={styles.room} id="plan-outfit" aria-labelledby="plan-outfit-heading">
      <header className={styles.roomHeader}>
        <span className={styles.roomIcon}><Shirt aria-hidden="true" size={16} /></span>
        <div>
          <h3 id="plan-outfit-heading">{text.title}</h3>
          <p>{text.subtitle}</p>
        </div>
      </header>

      <div className={styles.dayTabs} role="tablist" aria-label={text.title}>
        {days.map((day) => {
          const dayOutfit = byDay.get(day.day);
          const dayView = weatherOf(day);
          return (
            <button key={day.day} type="button" role="tab" aria-selected={day.day === current.day} className={styles.dayTab}
              data-empty={!dayOutfit} onClick={() => onSelectDay(day.day)}>
              <span className={styles.dayTabLabel}>{text.day(day.day)}</span>
              <span className={styles.dayTabWeather}>
                {dayView?.kind === "forecast" ? <SkyIcon sky={dayView.line.sky} size={13} /> : null}
                {dayOutfit ? `${dayOutfit.coldest.temp}°…${dayOutfit.warmest.temp}°` : "—"}
              </span>
            </button>
          );
        })}
      </div>

      {outfit ? (
        <div className={styles.roomBody} role="tabpanel" aria-label={text.day(current.day)}>
          <div className={styles.stage} data-weather={stageWeather(outfit) ?? "plain"}>
            <StageWeather weather={stageWeather(outfit)} reduce={reduce} />
            <motion.div className={styles.dollWrap} key={current.day}
              animate={reduce ? undefined : { y: [0, -2, 0] }} transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}>
              <Doll outfit={outfit} art={art} selected={chosen?.kind === "item" ? chosen.id : null} reduce={reduce} />
            </motion.div>
            <span className={styles.plinth} aria-hidden="true" />
          </div>

          <div className={styles.kit}>
            <Thermometer outfit={outfit} locale={locale} />
            <ul className={styles.slots} aria-label={text.title}>
              {slots.map(({ slot, entries }) => (
                <li key={slot} className={styles.slot} data-filled={entries.length > 0}>
                  <span className={styles.slotLabel}>{slotLabel(slot, locale)}</span>
                  {entries.length === 0 ? <span className={styles.slotEmpty}>{text.empty}</span> : (
                    <span className={styles.slotItems}>
                      {entries.map((entry) => (
                        <button key={entry.key} type="button" className={styles.item} data-kind={entry.kind}
                          aria-pressed={chosen?.key === entry.key}
                          onClick={() => setPicked(chosen?.key === entry.key ? null : { day: current.day, key: entry.key })}>
                          {entry.kind === "extra"
                            ? <Sparkles aria-hidden="true" size={11} className={styles.extraMark} />
                            : <span className={styles.swatch} style={{ background: swatchOf(entry) }} aria-hidden="true" />}
                          {entry.name}
                        </button>
                      ))}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <div className={styles.detail} aria-live="polite">
              {chosen ? (
                <>
                  <p className={styles.detailName}>
                    {chosen.name}
                    <span data-kind={chosen.kind}>{chosen.kind === "extra" ? text.fromMeri : text.fromWeather}</span>
                  </p>
                  <ul>{chosen.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
                </>
              ) : <p className={styles.detailHint}>{text.pick}</p>}
            </div>
          </div>
        </div>
      ) : (
        <p className={styles.noOutfit} role="tabpanel">{view?.kind === "beyond" ? text.beyond : text.noForecast}</p>
      )}

      {outfit ? (
        <div className={styles.notes}>
          {outfitNotes(outfit, locale).map((note) => <p key={note}>{note}</p>)}
        </div>
      ) : null}
    </section>
  );
}

/** A pixel thermometer from −20° to 35°, with the day's coldest and warmest and where they are. */
function Thermometer({ outfit, locale }: { readonly outfit: DayOutfit; readonly locale: Locale }) {
  const text = copy[locale];
  const from = thermometerAt(outfit.coldest.temp);
  const to = thermometerAt(outfit.warmest.temp);
  return (
    <div className={styles.thermometer}>
      <div className={styles.thermoTrack} aria-hidden="true">
        <span className={styles.thermoRange} style={{ left: `${from * 100}%`, width: `${Math.max(2, (to - from) * 100)}%` }} />
      </div>
      <div className={styles.thermoLabels}>
        <span><b>{outfit.coldest.temp}°</b> {text.coldest} · {outfit.coldest.place}</span>
        <span><b>{outfit.warmest.temp}°</b> {text.warmest} · {outfit.warmest.place}</span>
      </div>
    </div>
  );
}

const packedEvent = "meri:packed";

/** The saved ticks as stored, read safely: a browser that keeps nothing reads as none. */
function readPackedRaw(key: string): string {
  try {
    return window.localStorage.getItem(key) ?? "[]";
  } catch {
    return "[]";
  }
}

function parsePacked(raw: string): string[] {
  try {
    const saved = JSON.parse(raw) as unknown;
    return Array.isArray(saved) ? saved.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

function subscribePacked(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(packedEvent, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(packedEvent, onChange);
  };
}

/**
 * Everything the trip needs, as a backpack of tiles to tick off (1.2117 outfit). Ticks are kept
 * in this browser only, by trip; they are a convenience, not part of the plan.
 */
export function PackingList({ outfits, storageKey, locale }: {
  readonly outfits: readonly DayOutfit[];
  readonly storageKey: string;
  readonly locale: Locale;
}) {
  const text = copy[locale];
  // Read from this browser after hydration; the server renders nothing ticked.
  const raw = useSyncExternalStore(subscribePacked, () => readPackedRaw(storageKey), () => "[]");
  const packed = useMemo(() => parsePacked(raw), [raw]);
  const list = useMemo(() => packingList(outfits), [outfits]);
  if (outfits.length === 0) return null;
  const tiles = [
    ...list.base.map(({ id, days }) => ({ key: id, name: itemName(id, locale), days, swatch: itemPixels[id]?.swatch ?? bagSwatch[id] ?? extraSwatch, extra: false })),
    ...list.extras.map(({ name, days }) => ({ key: `extra:${name}`, name, days, swatch: extraSwatch, extra: true })),
  ];
  const done = tiles.filter(({ key }) => packed.includes(key)).length;
  const toggle = (key: string) => {
    const next = packed.includes(key) ? packed.filter((item) => item !== key) : [...packed, key];
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // A browser that keeps nothing cannot tick; the list still reads.
    }
    window.dispatchEvent(new Event(packedEvent));
  };

  return (
    <section className={styles.pack} aria-labelledby="plan-pack-heading">
      <header className={styles.packHeader}>
        <span className={styles.roomIcon}><Backpack aria-hidden="true" size={16} /></span>
        <div>
          <h3 id="plan-pack-heading">{text.packTitle}</h3>
          <p>{text.packHint}</p>
        </div>
        <span className={styles.packCount}>{text.packed(done, tiles.length)}</span>
      </header>
      <div className={styles.packBar} aria-hidden="true">
        {tiles.map(({ key }, index) => <i key={key} data-on={index < done} />)}
      </div>
      <ul className={styles.packGrid}>
        {tiles.map((tile) => (
          <li key={tile.key}>
            <label className={styles.packTile} data-packed={packed.includes(tile.key)} data-extra={tile.extra}>
              <input type="checkbox" checked={packed.includes(tile.key)} onChange={() => toggle(tile.key)} />
              {tile.extra ? <Sparkles aria-hidden="true" size={12} className={styles.extraMark} />
                : <span className={styles.swatch} style={{ background: tile.swatch }} aria-hidden="true" />}
              <span className={styles.packName}>{tile.name}</span>
              <span className={styles.packDays}>{text.days(tile.days)}</span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}
