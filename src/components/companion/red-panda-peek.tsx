"use client";

import { motion, useReducedMotion, useSpring, type Transition, type Variants } from "motion/react";
import { useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";

import turns from "../../../public/companion/red-panda/turns.json";
import styles from "./red-panda-peek.module.css";
import { frameFor, poseToward, typingTarget, type Point } from "./red-panda-peek-model";

/**
 * A red panda that climbs onto the chat box while it has focus: right paw, left paw, then the
 * head, settling with a small bounce; it slides back down when focus leaves. Its head really
 * turns toward the pointer — any way round, diagonals included — or toward the text being typed.
 * Decoration only: hidden from assistive technology and from the pointer, so it never gets in
 * the way of typing or clicking.
 *
 * The head is drawn from frames of AI-generated head-turn videos, one looking round a full
 * circle (assets/companion/red-panda/build_red_panda_turns.py, after oil-motion, MIT); the paws
 * are layers of their own (build_red_panda_layers.py) that stay on the edge while the head turns.
 */
const rows = Math.ceil(turns.count / turns.columns);
// How far from the face the pointer must be to turn the head fully: wide, so small moves near
// the box make small turns rather than a twitchy full turn.
const reach = { x: 420, y: 260 };
// The front frame alone, shown at once; the full sprite (~400 KB) loads when the browser is idle.
const frontUrl = "/companion/red-panda/front.webp";
const spriteUrl = "/companion/red-panda/turns.webp";

type Layer = "pawRight" | "pawLeft" | "body";
const enterDelay: Record<Layer, number> = { pawRight: 0, pawLeft: 0.12, body: 0.24 };
const exitDelay: Record<Layer, number> = { body: 0, pawLeft: 0.08, pawRight: 0.14 };

function climbVariants(layer: Layer, reduce: boolean): Variants {
  if (reduce) {
    return { down: { opacity: 0, transition: { duration: 0.15 } }, up: { opacity: 1, transition: { duration: 0.15 } } };
  }
  const settle: Transition = layer === "body"
    ? { type: "spring", stiffness: 260, damping: 17, mass: 0.9, delay: enterDelay[layer] }
    : { type: "spring", stiffness: 420, damping: 26, delay: enterDelay[layer] };
  return {
    down: { y: "105%", transition: { duration: 0.22, ease: [0.4, 0, 1, 1], delay: exitDelay[layer] } },
    up: { y: "0%", transition: settle },
  };
}

/** One sprite frame, shown by moving the sprite behind a frame-sized window. */
function frameStyle(index: number): CSSProperties {
  const column = index % turns.columns;
  const row = Math.floor(index / turns.columns);
  return {
    backgroundImage: `url(${spriteUrl})`,
    backgroundSize: `${turns.columns * 100}% ${rows * 100}%`,
    backgroundPosition: `${turns.columns > 1 ? (column / (turns.columns - 1)) * 100 : 0}% ${rows > 1 ? (row / (rows - 1)) * 100 : 0}%`,
  };
}

export function RedPandaPeek({ active, input }: {
  /** Whether the chat box has focus. */
  readonly active: boolean;
  /** The text box, so the panda can read along while someone types. */
  readonly input: RefObject<HTMLTextAreaElement | null>;
}) {
  const reduce = useReducedMotion() ?? false;
  const stage = useRef<HTMLDivElement>(null);
  const [spriteReady, setSpriteReady] = useState(false);
  // The frame showing, and the one before it while it fades out; `change` restarts the fade.
  const [shown, setShown] = useState({ current: turns.front, previous: null as number | null, change: 0 });
  // The pose eases after the pointer, so the head turns through its frames instead of jumping.
  const poseX = useSpring(0, { stiffness: 140, damping: 20 });
  const poseY = useSpring(0, { stiffness: 140, damping: 20 });

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      const image = new Image();
      image.onload = () => { if (!cancelled) setSpriteReady(true); };
      image.src = spriteUrl;
    };
    // Safari has no requestIdleCallback; a short timeout does the same job there.
    const idle = typeof window.requestIdleCallback === "function";
    const handle = idle ? window.requestIdleCallback(load, { timeout: 3000 }) : window.setTimeout(load, 1500);
    return () => {
      cancelled = true;
      if (idle) window.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
    };
  }, []);

  useEffect(() => {
    const update = () => setShown((was) => {
      const next = frameFor({ x: poseX.get(), y: poseY.get() }, turns, was.current);
      return next === was.current ? was : { current: next, previous: was.current, change: was.change + 1 };
    });
    const stopX = poseX.on("change", update);
    const stopY = poseY.on("change", update);
    return () => { stopX(); stopY(); };
  }, [poseX, poseY]);

  useEffect(() => {
    if (!active || reduce) {
      poseX.set(0);
      poseY.set(0);
      return;
    }
    const look = (target: Point) => {
      const box = stage.current?.getBoundingClientRect();
      if (!box || box.width === 0) return;
      // The face sits a little above the middle of the picture.
      const face = { x: box.left + box.width / 2, y: box.top + box.height * 0.45 };
      const pose = poseToward(face, target, reach);
      poseX.set(pose.x);
      poseY.set(pose.y);
    };
    const onPointer = (event: PointerEvent) => look({ x: event.clientX, y: event.clientY });
    const field = input.current;
    const onTyping = () => {
      if (!field) return;
      look(typingTarget(field.getBoundingClientRect(), field.value.length));
    };
    window.addEventListener("pointermove", onPointer, { passive: true });
    field?.addEventListener("input", onTyping);
    onTyping();
    return () => {
      window.removeEventListener("pointermove", onPointer);
      field?.removeEventListener("input", onTyping);
    };
  }, [active, input, reduce, poseX, poseY]);

  const state = active ? "up" : "down";
  const showFrames = spriteReady && !reduce;

  return (
    <div aria-hidden="true" className={styles.stage} data-active={active} ref={stage}>
      <motion.div animate={state} className={styles.layer} initial="down" variants={climbVariants("body", reduce)}>
        {showFrames ? <>
          <div className={styles.frame} style={frameStyle(shown.current)} />
          {shown.previous !== null
            ? <div className={`${styles.frame} ${styles.leaving}`} key={shown.change} style={frameStyle(shown.previous)} /> : null}
        </> : (
          // eslint-disable-next-line @next/next/no-img-element -- a fixed local decoration; next/image adds nothing here
          <img alt="" className={styles.picture} draggable={false} src={frontUrl} />
        )}
      </motion.div>
      <motion.div animate={state} className={styles.layer} initial="down" variants={climbVariants("pawLeft", reduce)}>
        {/* eslint-disable-next-line @next/next/no-img-element -- see above */}
        <img alt="" className={styles.picture} draggable={false} src="/companion/red-panda/paw-left.webp" />
      </motion.div>
      <motion.div animate={state} className={styles.layer} initial="down" variants={climbVariants("pawRight", reduce)}>
        {/* eslint-disable-next-line @next/next/no-img-element -- see above */}
        <img alt="" className={styles.picture} draggable={false} src="/companion/red-panda/paw-right.webp" />
      </motion.div>
    </div>
  );
}
