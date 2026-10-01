"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import {
  initialBearMemory,
  planNextActivity,
  rememberPlan,
  type BearMemory,
  type BearPlan,
  type BearReaction,
} from "./bear-behavior";
import { bearSpriteSheet, type BearAnimation } from "./bear-sprite-sheet";
import styles from "./companion.module.css";

const scale = 2;
/** How often a held pose checks whether a reaction wants the bear's attention. */
const holdCheckMs = 250;

function sameReaction(left: BearReaction, right: BearReaction): boolean {
  if (left === null || right === null) return left === right;
  if (left.kind !== right.kind) return false;
  return left.kind !== "ready" || right.kind !== "ready" || left.key === right.key;
}

/**
 * Plays the bear's sprite sheet. Choosing what to do is bear-behavior's job; this
 * component only keeps time, steps through frames, and asks for the next plan when a
 * plan ends or the reaction changes. A new reaction takes over at the next frame, but
 * never in the middle of a transition such as sitting down.
 */
export function CompanionBear({ reaction }: { readonly reaction: BearReaction }) {
  const reduceMotion = useReducedMotion();
  const [shown, setShown] = useState<{ readonly animation: BearAnimation; readonly frame: number }>(
    { animation: "idle", frame: 0 },
  );
  const reactionRef = useRef(reaction);
  const replanRef = useRef(false);

  useEffect(() => {
    if (sameReaction(reactionRef.current, reaction)) return;
    reactionRef.current = reaction;
    replanRef.current = true;
  }, [reaction]);

  useEffect(() => {
    if (reduceMotion) return;
    let memory: BearMemory = initialBearMemory;
    let plan: BearPlan = { activity: "idle", steps: [] };
    let stepIndex = 0;
    let frame = 0;
    let stepStartedAt = 0;
    let timer: number | undefined;

    function choosePlan(): void {
      const now = Date.now();
      plan = planNextActivity(memory, reactionRef.current, now, Math.random);
      memory = rememberPlan(memory, plan, reactionRef.current, now);
      replanRef.current = false;
      stepIndex = 0;
      frame = 0;
      stepStartedAt = now;
    }

    function finishStep(): void {
      const step = plan.steps[stepIndex];
      if (step.kind === "transition") memory = { ...memory, posture: step.posture };
      stepIndex += 1;
      frame = 0;
      stepStartedAt = Date.now();
      if (stepIndex >= plan.steps.length) choosePlan();
    }

    function tick(): void {
      timer = undefined;
      // A hidden tab keeps its place; visibilitychange resumes from here.
      if (document.hidden) return;
      const step = plan.steps[stepIndex];
      if (replanRef.current && step.kind !== "transition") {
        choosePlan();
        tick();
        return;
      }
      const elapsed = Date.now() - stepStartedAt;
      if (step.kind === "hold") {
        setShown({ animation: step.animation, frame: step.frame });
        if (elapsed >= step.durationMs) {
          finishStep();
          tick();
          return;
        }
        timer = window.setTimeout(tick, Math.min(holdCheckMs, step.durationMs - elapsed));
        return;
      }
      const animation = bearSpriteSheet.animations[step.animation];
      setShown({ animation: step.animation, frame });
      timer = window.setTimeout(() => {
        frame += 1;
        if (frame >= animation.frames) {
          const playedFor = Date.now() - stepStartedAt;
          const keepLooping = step.kind === "loop" && (step.durationMs === null || playedFor < step.durationMs);
          if (keepLooping) frame = 0;
          else finishStep();
        }
        tick();
      }, animation.durationsMs[frame]);
    }

    function resume(): void {
      if (!document.hidden && timer === undefined) tick();
    }

    choosePlan();
    tick();
    document.addEventListener("visibilitychange", resume);
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [reduceMotion]);

  // With reduced motion the bear sits still over its map.
  const { animation, frame } = reduceMotion ? { animation: "read" as const, frame: 0 } : shown;
  const { frameWidth, frameHeight, columns, rows, url } = bearSpriteSheet;
  const row = bearSpriteSheet.animations[animation].row;

  return (
    <div
      aria-hidden="true"
      className={styles.bear}
      data-animation={animation}
      style={{
        width: frameWidth * scale,
        height: frameHeight * scale,
        backgroundImage: `url(${url})`,
        backgroundSize: `${frameWidth * columns * scale}px ${frameHeight * rows * scale}px`,
        backgroundPosition: `${-frame * frameWidth * scale}px ${-row * frameHeight * scale}px`,
      }}
    />
  );
}
