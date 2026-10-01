"use client";

import { useReducedMotion } from "motion/react";
import { useId } from "react";

import type { DestinationField } from "@/domain/trip-state/trip-state";

import styles from "./trip-workspace.module.css";

/*
 * A decorative globe for the Journey column, adapted from cult-ui's
 * "Illustration Globe Vercel" (MIT, https://www.cult-ui.com): a wireframe dome whose
 * light pulses run down the meridians to small nodes. It carries no geography — one
 * node per chosen place only makes the picture grow with the Journey.
 */

type Step = readonly [meridian: number, row: number];

const width = 800;
const height = 400;
const cx = width / 2;
const cy = height;
const radius = height;
const meridians = [-4, -3, -2, -1, 0, 1, 2, 3, 4];
const rows = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const pulseSeconds = 5;
const maxNodes = 6;

// Fixed routes down the dome; the n-th chosen place takes the n-th route.
const routes: readonly (readonly Step[])[] = [
  [[1, 0], [1, 1], [1, 2]],
  [[-3, 0], [-3, 1], [-3, 2], [-3, 3], [-3, 4]],
  [[3, 0], [3, 1], [3, 2], [3, 3]],
  [[-1, 0], [-1, 1], [-2, 1]],
  [[0, 0], [0, 1], [0, 2], [0, 3], [-1, 3]],
  [[2, 0], [2, 1]],
];

function meridianA(index: number): number {
  return radius * Math.sin((Math.abs(index) / 4) * (Math.PI / 2)) * Math.sign(index);
}

function rowY(row: number): number {
  return cy - radius + row * ((2 * radius) / 10);
}

function pointOnMeridian(meridian: number, row: number): { x: number; y: number } {
  const a = meridianA(meridian);
  const y = rowY(row);
  const t = (y - cy) / radius;
  const xOffset = Math.abs(a) * Math.sqrt(Math.max(0, 1 - t * t));
  return { x: cx + (a >= 0 ? xOffset : -xOffset), y };
}

function routePath(route: readonly Step[]): { d: string; points: { x: number; y: number }[] } {
  const pole = { x: cx, y: cy - radius };
  const points = [pole, ...route.map(([meridian, row]) => pointOnMeridian(meridian, row))];
  const parts = [`M ${pole.x.toFixed(2)} ${pole.y.toFixed(2)}`];
  for (let index = 1; index < points.length; index += 1) {
    const point = points[index];
    const [meridian, row] = route[index - 1];
    const previous = index >= 2 ? route[index - 2] : null;
    const a = Math.abs(meridianA(meridian));
    const alongMeridian = previous === null || previous[0] === meridian;
    if (!alongMeridian || a < 0.5) {
      parts.push(`L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`);
      continue;
    }
    const downward = previous === null || row > previous[1];
    const sweep = meridian >= 0 ? (downward ? 1 : 0) : (downward ? 0 : 1);
    parts.push(`A ${a.toFixed(2)} ${radius} 0 0 ${sweep} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`);
  }
  return { d: parts.join(" "), points };
}

function placeCount(destination: DestinationField): number {
  if (destination.state === "missing") return 0;
  return destination.areas.reduce((total, area) => total + Math.max(1, area.places.length), 0);
}

export function JourneyGlobe({ destination }: { readonly destination: DestinationField }) {
  const reduceMotion = useReducedMotion();
  const idPrefix = useId().replaceAll(":", "");
  const nodes = routes.slice(0, Math.min(maxNodes, placeCount(destination))).map(routePath);

  return (
    <div aria-hidden="true" className={styles.journeyGlobe}>
      <svg viewBox={`-1 -1 ${width + 2} ${height + 2}`}>
        <g className={styles.globeWire}>
          <circle cx={cx} cy={cy} fill="none" r={radius} />
          {meridians.map((meridian) => (
            <path
              d={`M ${cx} ${cy + radius} A ${Math.abs(meridianA(meridian)).toFixed(3)} ${radius} 0 0 ${meridian >= 0 ? 1 : 0} ${cx} ${cy - radius}`}
              fill="none"
              key={meridian}
            />
          ))}
          {rows.map((row) => {
            const y = rowY(row);
            const half = radius * Math.sqrt(Math.max(0, 1 - ((y - cy) / radius) ** 2));
            return <line key={row} x1={(cx - half).toFixed(2)} x2={(cx + half).toFixed(2)} y1={y.toFixed(2)} y2={y.toFixed(2)} />;
          })}
        </g>
        {nodes.map((node, index) => (
          <GlobeNode
            delay={index * 0.6}
            id={`${idPrefix}-${index}`}
            key={index}
            node={node}
            still={reduceMotion === true}
          />
        ))}
      </svg>
    </div>
  );
}

function GlobeNode({
  delay,
  id,
  node,
  still,
}: {
  readonly delay: number;
  readonly id: string;
  readonly node: { d: string; points: { x: number; y: number }[] };
  readonly still: boolean;
}) {
  const end = node.points[node.points.length - 1];
  const phases = node.points.length + 3;
  const keyTimes = Array.from({ length: phases + 1 }, (_, index) => (index / phases).toFixed(4)).join(";");
  // The light travels pole → each waypoint → rests on the node → fades, then repeats.
  const frames = Array.from({ length: phases + 1 }, (_, index) => {
    if (index >= 1 && index <= node.points.length) return { point: node.points[index - 1], on: true };
    if (index === node.points.length + 1) return { point: end, on: true };
    if (index === node.points.length + 2) return { point: end, on: false };
    return { point: node.points[0], on: false };
  });
  const timing = { begin: `${delay}s`, dur: `${pulseSeconds}s`, keyTimes, repeatCount: "indefinite" } as const;
  const arrival = node.points.length / phases;
  const ringTimes = `0;${arrival.toFixed(4)};${Math.min(arrival + 0.06, 0.97).toFixed(4)};${Math.min(arrival + 0.12, 0.98).toFixed(4)};${Math.min(arrival + 0.2, 0.99).toFixed(4)};1`;

  return (
    <g>
      {still ? null : (
        <>
          <defs>
            <radialGradient cx={node.points[0].x} cy={node.points[0].y} gradientUnits="userSpaceOnUse" id={id} r="0">
              <stop className={styles.globePulseStop} offset="0" />
              <stop className={styles.globePulseStop} offset="0.4" />
              <stop className={styles.globePulseStop} offset="1" stopOpacity="0" />
              <animate attributeName="cx" values={frames.map(({ point }) => point.x.toFixed(1)).join(";")} {...timing} />
              <animate attributeName="cy" values={frames.map(({ point }) => point.y.toFixed(1)).join(";")} {...timing} />
              <animate attributeName="r" values={frames.map(({ on }) => (on ? "140" : "0")).join(";")} {...timing} />
            </radialGradient>
          </defs>
          <path d={node.d} fill="none" stroke={`url(#${id})`} strokeLinecap="round" strokeWidth="3">
            <animate attributeName="opacity" values={frames.map(({ on }) => (on ? "1" : "0")).join(";")} {...timing} />
          </path>
          <circle className={styles.globeRing} cx={end.x} cy={end.y} fill="none" opacity="0" r="0" strokeWidth="3">
            <animate attributeName="r" begin={`${delay}s`} dur={`${pulseSeconds}s`} keyTimes={ringTimes} repeatCount="indefinite" values="0;0;16;26;34;0" />
            <animate attributeName="opacity" begin={`${delay}s`} dur={`${pulseSeconds}s`} keyTimes={ringTimes} repeatCount="indefinite" values="0;0;0.9;0.5;0;0" />
          </circle>
        </>
      )}
      <circle className={styles.globeNodeBase} cx={end.x} cy={end.y} r="18" />
      <circle className={styles.globeNodeDot} cx={end.x} cy={end.y} r="8" />
    </g>
  );
}
