"use client";

import {
  animate,
  motion,
  useAnimationFrame,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type MotionValue,
} from "motion/react";
import Image from "next/image";
import { useRef, useState } from "react";

import type { SelectedPlaceImage } from "@/capabilities/destination/place-images";
import type { DestinationField } from "@/domain/trip-state/trip-state";

import { JourneyGlobe } from "./journey-globe";
import styles from "./trip-workspace.module.css";

/*
 * The chosen places' photos circle the decorative globe like a ring round a planet:
 * one photo per place, the same places the globe lights a node for. Everything is
 * percentages of the box, so the ring scales with the column.
 */
const ringCenterY = 66;
const ringRadiusX = 46;
const ringRadiusY = 16;
const secondsPerTurn = 48;
/** Straight in front of the globe: the lowest point of the ellipse. */
const frontAngle = Math.PI / 2;

/** How far round the ring a photo sits, from 0 (behind) to 1 (in front). */
function nearness(angle: number): number {
  return (Math.sin(angle) + 1) / 2;
}

export function JourneyOrbit({
  destination,
  photos,
}: {
  readonly destination: DestinationField;
  readonly photos: readonly SelectedPlaceImage[];
}) {
  const reduceMotion = useReducedMotion();
  // The ring's turn so far; each photo adds its own fixed offset round the circle.
  const turn = useMotionValue(0);
  const [hovered, setHovered] = useState(false);
  const steering = useRef(false);

  useAnimationFrame((_time, delta) => {
    if (reduceMotion || hovered || steering.current || photos.length === 0) return;
    turn.set(turn.get() + (delta / 1000) * ((2 * Math.PI) / secondsPerTurn));
  });

  function bringToFront(offset: number): void {
    const current = turn.get();
    // The shortest way round to put this photo at the front.
    const wanted = frontAngle - offset;
    const turns = Math.round((current - wanted) / (2 * Math.PI));
    steering.current = true;
    void animate(turn, wanted + turns * 2 * Math.PI, { duration: reduceMotion ? 0 : 0.8, ease: "easeInOut" })
      .then(() => { steering.current = false; });
  }

  return (
    <div className={styles.journeyOrbit} onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}>
      <div className={styles.journeyOrbitGlobe}>
        <JourneyGlobe destination={destination} />
      </div>
      {photos.length > 0 ? (
        <ul aria-label="已选地点的照片" className={styles.orbitPhotos}>
          {photos.map((photo, index) => (
            <OrbitPhoto
              key={photo.key}
              offset={(index / photos.length) * 2 * Math.PI + frontAngle}
              onSelect={bringToFront}
              photo={photo}
              turn={turn}
            />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function OrbitPhoto({ photo, offset, turn, onSelect }: {
  readonly photo: SelectedPlaceImage;
  readonly offset: number;
  readonly turn: MotionValue<number>;
  readonly onSelect: (offset: number) => void;
}) {
  const [failed, setFailed] = useState(false);
  const left = useTransform(turn, (value) => `${50 + ringRadiusX * Math.cos(value + offset)}%`);
  const top = useTransform(turn, (value) => `${ringCenterY + ringRadiusY * Math.sin(value + offset)}%`);
  const scale = useTransform(turn, (value) => 0.62 + 0.38 * nearness(value + offset));
  const opacity = useTransform(turn, (value) => 0.4 + 0.6 * nearness(value + offset));
  // Behind the globe's wireframe while on the far side, in front of it on the near side.
  const zIndex = useTransform(turn, (value) => (Math.sin(value + offset) > 0 ? 3 : 1));
  if (failed) return null;
  return (
    <motion.li className={styles.orbitPhoto} style={{ left, top, scale, opacity, zIndex }}>
      <button aria-label={`${photo.label}：${photo.image.caption}`} onClick={() => onSelect(offset)} title={`${photo.label} · ${photo.image.caption}`} type="button">
        <Image alt="" fill onError={() => setFailed(true)} sizes="84px" src={photo.image.url} />
        <span>{photo.label}</span>
      </button>
    </motion.li>
  );
}
