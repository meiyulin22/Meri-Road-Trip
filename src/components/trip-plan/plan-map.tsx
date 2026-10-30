"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { useMessages } from "@/components/i18n/locale-context";

import { between, fitView, geography, onScreen, project, type Point, type View } from "./plan-map-model";
import type { LonLat, PlanDay } from "./plan-view";
import styles from "./trip-plan.module.css";

/**
 * The sketch map beside the plan: the area's lakes, mountains and roads, the chosen day's
 * stops numbered in order with the route between them, the other days' stops faint. The
 * camera glides to whichever day is chosen. Labels stay in Chinese in both languages, as
 * Tianditu's will. Decorative geometry only; the day cards carry the same facts as text.
 */
export function PlanMap({ days, selected, onSelect, highlighted }: {
  readonly days: readonly PlanDay[];
  /** A day number, or null for the whole trip. */
  readonly selected: number | null;
  readonly onSelect: (day: number | null) => void;
  readonly highlighted: string | null;
}) {
  const text = useMessages().plan;
  const reduce = useReducedMotion() ?? false;
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useState<View | null>(null);
  const viewRef = useRef<View | null>(null);

  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width: Math.round(width), height: Math.round(height) });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const shown = selected === null ? days : days.filter((day) => day.day === selected);
  const stops = shown.flatMap((day) => day.stops.map((stop) => project(stop.point)));
  // Nothing planned yet: frame the towns, so the area shows while the first day is worked out.
  const framed = stops.length > 0 ? stops : geography.towns.map((town) => project(town.point));
  const targetKey = `${selected}:${size.width}x${size.height}:${framed.length}`;

  useEffect(() => {
    if (size.width === 0) return;
    const target = fitView(framed, size.width, size.height, Math.min(56, size.width * 0.14), 3.2);
    const from = viewRef.current;
    if (!from || reduce) {
      viewRef.current = target;
      setView(target);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 650);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = between(from, target, eased);
      viewRef.current = next;
      setView(next);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
    // The target is fully described by targetKey; framed is rebuilt every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey, reduce]);

  const at = (point: LonLat): Point => (view ? onScreen(project(point), view) : { x: -999, y: -999 });
  const path = (line: readonly LonLat[]) => line.map((point, index) => {
    const { x, y } = at(point);
    return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  return (
    <section className={styles.mapCard} aria-labelledby="plan-map-title">
      <div className={styles.mapHeader}>
        <h2 id="plan-map-title">{text.mapTitle}</h2>
        <div className={styles.mapTabs} role="tablist" aria-label={text.mapTitle}>
          <button type="button" role="tab" aria-selected={selected === null} onClick={() => onSelect(null)}>{text.wholeTrip}</button>
          {days.map((day) => (
            <button type="button" role="tab" key={day.day} aria-selected={selected === day.day} onClick={() => onSelect(day.day)}>
              {day.day}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.mapCanvas} ref={box}>
        {view ? (
          <svg aria-hidden="true" width={size.width} height={size.height} viewBox={`0 0 ${size.width} ${size.height}`}>
            <defs>
              <pattern id="plan-map-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
                <line x1="0" y1="0" x2="0" y2="7" className={styles.mapHatch} />
              </pattern>
            </defs>
            <rect width={size.width} height={size.height} className={styles.mapLand} />
            {geography.ridges.map((ridge) => {
              const points = ridge.line.map(at);
              return (
                <g key={ridge.name}>
                  {[34, 22, 12].map((width) => (
                    <path key={width} d={path(ridge.line)} className={styles.mapContour} strokeWidth={width * Math.max(0.6, view.scale)} />
                  ))}
                  {points.map((point, index) => (
                    <path key={index} className={styles.mapPeak}
                      d={`M${point.x - 6},${point.y + 5} L${point.x},${point.y - 6} L${point.x + 6},${point.y + 5} Z`} />
                  ))}
                  <text className={styles.mapRidgeLabel} x={at(ridge.label).x} y={at(ridge.label).y}>{ridge.name}</text>
                </g>
              );
            })}
            {geography.lakes.map((lake) => (
              <g key={lake.name}>
                <path d={`${path(lake.shape)} Z`} className={styles.mapLake} />
                <path d={`${path(lake.shape)} Z`} fill="url(#plan-map-hatch)" />
                <text className={styles.mapWaterLabel} x={at(lake.label).x} y={at(lake.label).y}>{lake.name}</text>
              </g>
            ))}
            {geography.roads.map((road, index) => (
              <g key={index}>
                <path d={path(road)} className={styles.mapRoadCase} />
                <path d={path(road)} className={styles.mapRoad} />
              </g>
            ))}
            {geography.towns.map((town) => (
              <text key={town.name} className={styles.mapTown} x={at(town.point).x + 10} y={at(town.point).y - 10}>{town.name}</text>
            ))}
            {days.filter((day) => !shown.includes(day)).flatMap((day) => day.stops).map((stop) => (
              <circle key={`faint-${stop.id}`} cx={at(stop.point).x} cy={at(stop.point).y} r={3} className={styles.mapFaintStop} />
            ))}
            {shown.map((day) => (
              <g key={day.day}>
                {day.legs.map((leg, index) => {
                  const from = at(day.stops[index].point);
                  const to = at(day.stops[index + 1].point);
                  const bend = { x: (from.y - to.y) * 0.12, y: (to.x - from.x) * 0.12 };
                  return (
                    <path key={index} className={leg.mode === "walk" ? styles.mapWalk : styles.mapRoute}
                      d={`M${from.x},${from.y} Q${(from.x + to.x) / 2 + bend.x},${(from.y + to.y) / 2 + bend.y} ${to.x},${to.y}`} />
                  );
                })}
              </g>
            ))}
            {shown.map((day) => {
              let number = 0;
              // Names go right of their pin, or left when that would cover a name already placed.
              const placed: { x: number; y: number; right: boolean }[] = [];
              return day.stops.map((stop) => {
                const point = at(stop.point);
                const isStay = stop.kind === "stay";
                if (!isStay) number += 1;
                const active = highlighted === stop.id;
                return (
                  <g key={stop.id} className={styles.mapPin} data-active={active} data-kind={stop.kind}
                    transform={`translate(${point.x.toFixed(1)} ${point.y.toFixed(1)})`}>
                    {isStay
                      ? <rect x={-7} y={-7} width={14} height={14} rx={3} />
                      : <circle r={active ? 13 : 11} />}
                    {isStay ? null : <text y={4}>{selected === null ? day.day : number}</text>}
                    {selected === null ? null : (() => {
                      const crowded = placed.some((other) => other.right && Math.abs(other.y - point.y) < 16 && Math.abs(other.x - point.x) < 110);
                      placed.push({ x: point.x, y: point.y, right: !crowded });
                      return crowded
                        ? <text className={styles.mapPinLabel} x={-16} y={4} textAnchor="end">{stop.name}</text>
                        : <text className={styles.mapPinLabel} x={16} y={4}>{stop.name}</text>;
                    })()}
                  </g>
                );
              });
            })}
          </svg>
        ) : null}
      </div>
      <p className={styles.mapNote}>{text.mapSketch}</p>
    </section>
  );
}
