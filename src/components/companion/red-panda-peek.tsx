"use client";

import { motion, useReducedMotion, useSpring, type Transition, type Variants } from "motion/react";
import { useEffect, useRef, useState, type RefObject } from "react";

import geometry from "../../../public/companion/red-panda/red-panda.json";
import styles from "./red-panda-peek.module.css";
import { nextBlinkDelay, pupilOffset, typingTarget, type Point } from "./red-panda-peek-model";

/**
 * A red panda that climbs onto the chat box while it has focus: right paw, left paw, then the
 * head, settling with a small bounce; it slides back down when focus leaves. Its pupils follow
 * the pointer (or the text being typed) and it blinks now and then. Decoration only: hidden from
 * assistive technology and from the pointer, so it never gets in the way of typing or clicking.
 *
 * The layers come from assets/companion/red-panda/build_red_panda_layers.py. They only carry the
 * climb; once settled the untouched original picture is shown, so the still frame has no cut edges.
 */
const { width: W, height: H, eyes } = geometry;
const eyePoints = eyes.map((eye) => ({ cx: eye.cx * W, cy: eye.cy * H, rx: eye.rx * W, ry: eye.ry * H }));
// Measured from the fur just above the eyes, so a closing lid reads as the panda's own face.
const lidColour = "#9f4826";

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

export function RedPandaPeek({ active, input }: {
  /** Whether the chat box has focus. */
  readonly active: boolean;
  /** The text box, so the panda can read along while someone types. */
  readonly input: RefObject<HTMLTextAreaElement | null>;
}) {
  const reduce = useReducedMotion() ?? false;
  const svg = useRef<SVGSVGElement>(null);
  const [settled, setSettled] = useState(false);
  const [blinking, setBlinking] = useState(false);
  // A spring per pupil axis, so the eyes ease after the pointer instead of jumping.
  const springy = { stiffness: 240, damping: 22, mass: 0.6 };
  const leftX = useSpring(0, springy);
  const leftY = useSpring(0, springy);
  const rightX = useSpring(0, springy);
  const rightY = useSpring(0, springy);
  const pupils = [{ x: leftX, y: leftY }, { x: rightX, y: rightY }];

  useEffect(() => {
    if (!active) return;
    const axes = [{ x: leftX, y: leftY }, { x: rightX, y: rightY }];
    // Each eye works out its own direction from where it is drawn on screen.
    const look = (target: Point) => {
      const box = svg.current?.getBoundingClientRect();
      if (!box || box.width === 0) return;
      const scale = box.width / W;
      eyePoints.forEach((eye, index) => {
        const centre = { x: box.left + eye.cx * scale, y: box.top + eye.cy * scale };
        const offset = pupilOffset(centre, target, Math.min(eye.rx, eye.ry) * 0.42, 320);
        axes[index].x.set(offset.x);
        axes[index].y.set(offset.y);
      });
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
  }, [active, input, leftX, leftY, rightX, rightY]);

  useEffect(() => {
    if (!settled || reduce) return;
    let timer = 0;
    const schedule = () => {
      timer = window.setTimeout(() => {
        setBlinking(true);
        timer = window.setTimeout(() => {
          setBlinking(false);
          schedule();
        }, 150);
      }, nextBlinkDelay());
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, [settled, reduce]);

  const state = active ? "up" : "down";
  const layers = !settled;

  return (
    <div aria-hidden="true" className={styles.stage} data-active={active}>
      <motion.div animate={state} className={styles.layer} initial="down" variants={climbVariants("body", reduce)}
        onAnimationComplete={(definition) => setSettled(definition === "up")}
        onAnimationStart={() => setSettled(false)}>
        {/* eslint-disable-next-line @next/next/no-img-element -- a fixed local decoration; next/image adds nothing here */}
        <img alt="" className={styles.picture} draggable={false} src={layers ? "/companion/red-panda/body.webp" : "/companion/red-panda/whole.webp"} />
        <svg className={styles.eyes} ref={svg} viewBox={`0 0 ${W} ${H}`}>
          <defs>
            {eyePoints.map((eye, index) => (
              <clipPath id={`red-panda-eye-${index}`} key={index}>
                <ellipse cx={eye.cx} cy={eye.cy} rx={eye.rx + 0.5} ry={eye.ry + 0.5} />
              </clipPath>
            ))}
          </defs>
          {eyePoints.map((eye, index) => {
            const radius = Math.min(eye.rx, eye.ry) * 0.5;
            return (
              <g clipPath={`url(#red-panda-eye-${index})`} key={index}>
                <motion.g style={{ x: pupils[index].x, y: pupils[index].y }}>
                  <circle cx={eye.cx} cy={eye.cy} fill="#2a1a14" r={radius} />
                  <circle cx={eye.cx + radius * 0.35} cy={eye.cy - radius * 0.38} fill="#ffffff" r={radius * 0.3} />
                </motion.g>
                <motion.rect animate={{ height: blinking ? eye.ry * 2 + 2 : 0 }} fill={lidColour}
                  height={0} initial={false} transition={{ duration: 0.07, ease: "easeInOut" }}
                  width={eye.rx * 2 + 2} x={eye.cx - eye.rx - 1} y={eye.cy - eye.ry - 1} />
              </g>
            );
          })}
        </svg>
      </motion.div>
      <motion.div animate={state} className={styles.layer} data-hidden={!layers} initial="down"
        variants={climbVariants("pawLeft", reduce)}>
        {/* eslint-disable-next-line @next/next/no-img-element -- see above */}
        <img alt="" className={styles.picture} draggable={false} src="/companion/red-panda/paw-left.webp" />
      </motion.div>
      <motion.div animate={state} className={styles.layer} data-hidden={!layers} initial="down"
        variants={climbVariants("pawRight", reduce)}>
        {/* eslint-disable-next-line @next/next/no-img-element -- see above */}
        <img alt="" className={styles.picture} draggable={false} src="/companion/red-panda/paw-right.webp" />
      </motion.div>
    </div>
  );
}
