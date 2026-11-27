"use client";

import "leaflet/dist/leaflet.css";

import type { LayerGroup, Map as LeafletMap } from "leaflet";
import { type CSSProperties, useEffect, useRef, useState } from "react";

import type { Locale } from "@/domain/locale/locale";
import type { ReadyPlan } from "@/domain/plan/plan-draft-response";

import { dayColor } from "./plan-day-colors";
import { cityIcon, dayLines, dayOnMap, type DayOnMap, highlightedStops, labelLayer, lineStrokes, mapStops, markerIcon, type MapStop, tileUrl, transferInk, transferLines } from "./plan-tianditu-map-model";
import draftStyles from "./plan-draft.module.css";

type Leaflet = typeof import("leaflet");

const copy = {
  zh: {
    title: "地图", wholeTrip: "全程", day: (day: number) => `第 ${day} 天`, failed: "地图没有加载出来。",
    cityOnly: (day: number, city: string) => `第 ${day} 天的景点还没在地图上找到，先显示它所在的${city}。`,
    unplaced: (day: number) => `第 ${day} 天的景点还没在地图上找到，这里显示全程。`,
    legend: { drive: "开车", walk: "步行", none: "地图上没有路", between: "城市之间" },
  },
  en: {
    title: "Map", wholeTrip: "Whole trip", day: (day: number) => `Day ${day}`, failed: "The map didn’t load.",
    cityOnly: (day: number, city: string) => `Day ${day}'s stops aren't on the map yet, so it shows where ${city} is.`,
    unplaced: (day: number) => `Day ${day}'s stops aren't on the map yet, so it shows the whole trip.`,
    legend: { drive: "Drive", walk: "Walk", none: "No road on the map", between: "Between cities" },
  },
} as const;

// Tianditu's map must carry its name and review number wherever it is shown.
const attribution = "天地图 · GS(2026)4921号 - 甲测资字11110974";
// The relay serves China only; the map does not pan away from it.
const chinaBounds: [[number, number], [number, number]] = [[3, 73], [54, 136]];

/**
 * The plan's stops on a Tianditu map, drawn with Leaflet from tiles Meri's server relays
 * (1.2104), so no key reaches the browser and visitors abroad see the map too. Each day has its
 * own colour, shared with its day card (1.2105). The chosen day's stops — or every day's, for the
 * whole trip — are numbered, joined by a solid line along the road, a dotted one on foot, and a
 * dashed one where the map has no way; in a one-day view the other days' are small and grey.
 * Only located stops are drawn; the day cards carry every stop as text.
 */
export function PlanTiandituMap({ plan, locale, selectedDay, onSelectDay, hotel = null }: {
  readonly plan: ReadyPlan;
  /** A hotel or restaurant the reader chose to see on the map (1.2117 stays and food), drawn over the day's pins. */
  readonly hotel?: { readonly name: string; readonly kind?: "hotel" | "food"; readonly point: { readonly longitude: number; readonly latitude: number } } | null;
  readonly locale: Locale;
  /** A day number, or null for the whole trip. */
  readonly selectedDay: number | null;
  readonly onSelectDay: (day: number | null) => void;
}) {
  const text = copy[locale];
  const stops = mapStops(plan);
  // Every day has a tab: a day without located stops still shows where it is (1.2101).
  const days = plan.draft.days.map(({ day }) => day);
  const container = useRef<HTMLDivElement>(null);
  const leaflet = useRef<{ L: Leaflet; map: LeafletMap; overlays: LayerGroup; hotel: LayerGroup } | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const chosen = selectedDay !== null && days.includes(selectedDay) ? selectedDay : null;
  const view: DayOnMap | null = chosen === null ? null : dayOnMap(plan, stops, chosen);
  const note = view?.kind === "city" && chosen !== null ? text.cityOnly(chosen, view.name)
    : view?.kind === "unplaced" && chosen !== null ? text.unplaced(chosen) : null;

  // Leaflet touches the window, so it loads in the browser, once, with the labels in the page's language.
  useEffect(() => {
    let cancelled = false;
    void import("leaflet").then((L) => {
      if (cancelled || !container.current || leaflet.current) return;
      const map = L.map(container.current, { minZoom: 3, maxZoom: 18, maxBounds: chinaBounds });
      map.attributionControl.setPrefix(false);
      let loaded = false;
      const base = L.tileLayer(tileUrl("vec"), { minZoom: 3, maxZoom: 18, attribution });
      // Tiles load side by side, so one may fail before any arrives: the note goes again once one loads
      // (2026-11-27: the map showed while it said it had not loaded).
      base.on("tileload", () => {
        if (!loaded) setFailed(false);
        loaded = true;
      });
      base.on("tileerror", () => { if (!loaded) setFailed(true); });
      base.addTo(map);
      L.tileLayer(tileUrl(labelLayer()), { minZoom: 3, maxZoom: 18 }).addTo(map);
      leaflet.current = { L, map, overlays: L.layerGroup().addTo(map), hotel: L.layerGroup().addTo(map) };
      setReady(true);
    });
    return () => {
      cancelled = true;
      leaflet.current?.map.remove();
      leaflet.current = null;
      setReady(false);
    };
  }, [locale]);

  useEffect(() => {
    const current = leaflet.current;
    if (!ready || !current || stops.length === 0) return;
    current.overlays.clearLayers();
    if (view?.kind === "city" && chosen !== null) drawCity(current, stops, view, dayColor(chosen).solid);
    else drawStops(current, stops, view?.kind === "stops" ? chosen : null, plan.draft.legs ?? [], plan.draft.transfers ?? []);
    // stops are rebuilt each render from the plan; the plan and the chosen day decide them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, plan, chosen]);

  // The chosen hotel, on top of everything, and the map moves to it.
  useEffect(() => {
    const current = leaflet.current;
    if (!ready || !current) return;
    current.hotel.clearLayers();
    if (!hotel) return;
    current.L.marker([hotel.point.latitude, hotel.point.longitude], { icon: pin(current.L, hotel.kind === "food" ? foodIcon : hotelIcon), title: hotel.name, zIndexOffset: 2_000 })
      .bindTooltip(hotel.name, { direction: "top", offset: [0, -14], permanent: true }).addTo(current.hotel);
    current.map.setView([hotel.point.latitude, hotel.point.longitude], 15);
  }, [ready, hotel]);

  if (stops.length === 0) return null;
  return (
    <section className={draftStyles.mapCard} aria-labelledby="plan-map-heading">
      <div className={draftStyles.mapHeader}>
        <h3 id="plan-map-heading">{text.title}</h3>
        <div className={draftStyles.mapTabs} role="tablist" aria-label={text.title}>
          <button type="button" role="tab" aria-selected={chosen === null} onClick={() => onSelectDay(null)}>{text.wholeTrip}</button>
          {days.map((day) => (
            <button type="button" role="tab" key={day} aria-selected={chosen === day} aria-label={text.day(day)} onClick={() => onSelectDay(day)}
              data-day="" style={{ "--day-color": dayColor(day).solid } as CSSProperties}>{day}</button>
          ))}
        </div>
      </div>
      <div className={draftStyles.mapCanvas} ref={container} lang={locale === "zh" ? "zh-CN" : "en"} />
      <ul className={draftStyles.mapLegend} aria-label={locale === "zh" ? "线条说明" : "Line key"}>
        <li data-kind="road">{text.legend.drive}</li>
        <li data-kind="walk">{text.legend.walk}</li>
        <li data-kind="straight">{text.legend.none}</li>
        {transferLines(plan.draft.transfers ?? [], null).length > 0 ? <li data-kind="between">{text.legend.between}</li> : null}
      </ul>
      {failed ? <p className={draftStyles.mapNote} role="status">{text.failed}</p> : null}
      {note ? <p className={draftStyles.mapNote} role="status">{note}</p> : null}
    </section>
  );
}

type Drawing = { readonly L: Leaflet; readonly map: LeafletMap; readonly overlays: LayerGroup };

/** A hotel pin: a dark square with a bed, apart from the round numbered stops (1.2117 stays). */
const hotelIcon = {
  size: 28,
  url: "data:image/svg+xml," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">'
    + '<rect x="2" y="2" width="24" height="24" rx="5" fill="#213e40" stroke="#fff" stroke-width="2"/>'
    + '<path d="M7 19v-9M7 15h14v4M21 15v-2a2 2 0 0 0-2-2h-6v4" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
    + '<circle cx="10" cy="12.5" r="1.6" fill="#fff"/></svg>'),
};

/** A restaurant pin: the same square in terracotta, with a fork and knife (1.2117 food). */
const foodIcon = {
  size: 28,
  url: "data:image/svg+xml," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">'
    + '<rect x="2" y="2" width="24" height="24" rx="5" fill="#c95f3d" stroke="#fff" stroke-width="2"/>'
    + '<path d="M10 7v14M8 7v4a2 2 0 0 0 4 0V7M18 21V7c-2 1-3 3-3 6h3" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'),
};

function pin(L: Leaflet, icon: { url: string; size: number }) {
  return L.icon({ iconUrl: icon.url, iconSize: [icon.size, icon.size], iconAnchor: [icon.size / 2, icon.size / 2] });
}

/** A day placed only by its city: every stop faint, and a ring where the city's stops are. */
function drawCity({ L, map, overlays }: Drawing, stops: readonly MapStop[], city: Extract<DayOnMap, { kind: "city" }>, color: string): void {
  for (const stop of stops) L.marker([stop.latitude, stop.longitude], { icon: pin(L, markerIcon(stop.number, null)), title: stop.name }).addTo(overlays);
  L.marker([city.latitude, city.longitude], { icon: pin(L, cityIcon(color)), title: city.name }).addTo(overlays);
  map.setView([city.latitude, city.longitude], 11);
}

function drawStops(
  { L, map, overlays }: Drawing, stops: readonly MapStop[], day: number | null,
  legs: Parameters<typeof dayLines>[1], transfers: Parameters<typeof transferLines>[0],
): void {
  const highlighted = new Set(highlightedStops(stops, day));
  // Roads between cities first, under the days' own lines; they do not set the frame.
  for (const line of transferLines(transfers, day)) {
    const points = line.path.map(([longitude, latitude]) => [latitude, longitude] as [number, number]);
    L.polyline(points, { color: transferInk, weight: 3, opacity: line.faint ? 0.3 : 0.55, lineCap: "round" }).addTo(overlays);
  }
  for (const number of [...new Set([...highlighted].map(({ day: value }) => value))]) {
    for (const line of dayLines(stops, legs, number)) {
      const points = line.path.map(([longitude, latitude]) => [latitude, longitude] as [number, number]);
      for (const stroke of lineStrokes(line.kind, dayColor(number).solid)) L.polyline(points, { ...stroke }).addTo(overlays);
    }
  }
  // Faint pins first, so the chosen day's sit on top of them.
  for (const stop of [...stops].sort((left, right) => Number(highlighted.has(left)) - Number(highlighted.has(right)))) {
    L.marker([stop.latitude, stop.longitude], {
      icon: pin(L, markerIcon(stop.number, highlighted.has(stop) ? dayColor(stop.day).solid : null)), title: stop.name, zIndexOffset: highlighted.has(stop) ? 1_000 : 0,
    }).addTo(overlays);
  }
  const framed = [...highlighted].map((stop) => [stop.latitude, stop.longitude] as [number, number]);
  if (framed.length === 1) map.setView(framed[0], 14);
  else if (framed.length > 1) map.fitBounds(L.latLngBounds(framed), { padding: [40, 40], maxZoom: 15 });
}
