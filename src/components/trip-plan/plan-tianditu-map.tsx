"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

import type { Locale } from "@/domain/locale/locale";
import type { ReadyPlan } from "@/domain/plan/plan-draft-response";

import { highlightedStops, labelLayer, mapStops, markerIcon, type MapStop, tileUrl } from "./plan-tianditu-map-model";
import draftStyles from "./plan-draft.module.css";

/** The few parts of the Tianditu JS API 4.0 this map uses; the script defines them on `window.T`. */
type LngLat = object;
type Overlay = object;
type TiandituMap = {
  addOverLay(overlay: Overlay): void;
  clearOverLays(): void;
  setViewport(points: LngLat[]): void;
  centerAndZoom(point: LngLat, zoom: number): void;
};
type TiandituApi = {
  Map: new (container: HTMLElement, options: { layers: object[]; minZoom?: number; maxZoom?: number }) => TiandituMap;
  TileLayer: new (url: string, options: { minZoom: number; maxZoom: number }) => object;
  LngLat: new (longitude: number, latitude: number) => LngLat;
  Point: new (x: number, y: number) => object;
  Icon: new (options: { iconUrl: string; iconSize: object; iconAnchor: object }) => object;
  Marker: new (point: LngLat, options: { icon: object; title?: string; zIndexOffset?: number }) => Overlay;
  Polyline: new (points: LngLat[], options: { color: string; weight: number; opacity: number; lineStyle: "solid" | "dashed" }) => Overlay;
};
declare global {
  interface Window { T?: TiandituApi }
}

// Public by design: the browser loads the map with it, and Tianditu accepts it only from the
// domains on its whitelist. The server's lookups use their own key (TIANDITU_API_KEY).
const browserKey = process.env.NEXT_PUBLIC_TIANDITU_BROWSER_KEY?.trim() ?? "";

const copy = {
  zh: { title: "地图", wholeTrip: "全程", day: (day: number) => `第 ${day} 天`, unconfigured: "地图还没有配置。", failed: "地图没有加载出来。", none: "这份计划里的景点还没有坐标，暂时没有地图。" },
  en: { title: "Map", wholeTrip: "Whole trip", day: (day: number) => `Day ${day}`, unconfigured: "The map is not set up yet.", failed: "The map didn’t load.", none: "This plan’s stops have no coordinates yet, so there is no map." },
} as const;

/**
 * The plan's stops on a Tianditu map: the chosen day's numbered in order with a faint dashed
 * line showing the order (not a road route), the other days' small and grey. Only stops the
 * map check located are drawn; the day cards carry every stop as text.
 */
export function PlanTiandituMap({ plan, locale, selectedDay, onSelectDay }: {
  readonly plan: ReadyPlan;
  readonly locale: Locale;
  /** A day number, or null for the whole trip. */
  readonly selectedDay: number | null;
  readonly onSelectDay: (day: number | null) => void;
}) {
  const text = copy[locale];
  const stops = mapStops(plan);
  const days = [...new Set(stops.map(({ day }) => day))];
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<TiandituMap | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const chosen = selectedDay !== null && days.includes(selectedDay) ? selectedDay : null;

  // Built once the script is ready, with the street map and labels in the page's language.
  useEffect(() => {
    const T = window.T;
    if (!ready || !T || !container.current || map.current) return;
    const layer = (name: "vec" | "cva" | "eva") => new T.TileLayer(tileUrl(name, browserKey, Math.floor(Math.random() * 8)), { minZoom: 1, maxZoom: 18 });
    map.current = new T.Map(container.current, { layers: [layer("vec"), layer(labelLayer(locale))], minZoom: 3, maxZoom: 18 });
  }, [ready, locale]);

  useEffect(() => {
    const T = window.T;
    const current = map.current;
    if (!T || !current || stops.length === 0) return;
    current.clearOverLays();
    drawStops(T, current, stops, chosen);
    // stops are rebuilt each render from the plan; the plan and the chosen day decide them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, plan, chosen]);

  if (stops.length === 0) return null;
  return (
    <section className={draftStyles.mapCard} aria-labelledby="plan-map-heading">
      <div className={draftStyles.mapHeader}>
        <h3 id="plan-map-heading">{text.title}</h3>
        <div className={draftStyles.mapTabs} role="tablist" aria-label={text.title}>
          <button type="button" role="tab" aria-selected={chosen === null} onClick={() => onSelectDay(null)}>{text.wholeTrip}</button>
          {days.map((day) => (
            <button type="button" role="tab" key={day} aria-selected={chosen === day} aria-label={text.day(day)} onClick={() => onSelectDay(day)}>{day}</button>
          ))}
        </div>
      </div>
      {browserKey ? (
        <>
          <Script src={`https://api.tianditu.gov.cn/api?v=4.0&tk=${encodeURIComponent(browserKey)}`}
            onReady={() => setReady(true)} onError={() => setFailed(true)} />
          <div className={draftStyles.mapCanvas} ref={container} lang={locale === "zh" ? "zh-CN" : "en"} />
          {failed ? <p className={draftStyles.mapNote} role="status">{text.failed}</p> : null}
        </>
      ) : <p className={draftStyles.mapNote} role="status">{text.unconfigured}</p>}
    </section>
  );
}

function drawStops(T: TiandituApi, map: TiandituMap, stops: readonly MapStop[], day: number | null): void {
  const highlighted = new Set(highlightedStops(stops, day));
  const point = (stop: MapStop) => new T.LngLat(stop.longitude, stop.latitude);
  // Faint pins first, so the chosen day's sit on top of them.
  for (const stop of [...stops].sort((left, right) => Number(highlighted.has(left)) - Number(highlighted.has(right)))) {
    const icon = markerIcon(stop.number, highlighted.has(stop));
    map.addOverLay(new T.Marker(point(stop), {
      title: stop.name,
      icon: new T.Icon({ iconUrl: icon.url, iconSize: new T.Point(icon.size, icon.size), iconAnchor: new T.Point(icon.size / 2, icon.size / 2) }),
    }));
  }
  const shownDays = [...new Set([...highlighted].map(({ day: number }) => number))];
  for (const number of shownDays) {
    const line = stops.filter((stop) => stop.day === number).map(point);
    if (line.length > 1) map.addOverLay(new T.Polyline(line, { color: "#2f5d46", weight: 2, opacity: 0.55, lineStyle: "dashed" }));
  }
  const framed = [...highlighted].map(point);
  if (framed.length === 1) map.centerAndZoom(framed[0], 13);
  else map.setViewport(framed);
}
