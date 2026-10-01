import type { BearAnimation } from "./bear-sprite-sheet";

/**
 * What the bear does next, as a pure decision (docs/product/companion-bear.md).
 * Reactions to what is happening in the app come first; otherwise the bear picks a
 * free-time activity at random, within rules that keep it from looking mechanical.
 * Randomness and time are passed in, so the rules are testable.
 */

/** Where the bear is: standing behind the table, seated with the map up, or seated with it put down. */
export type BearPosture = "standing" | "seated" | "seatedMapDown";

export type BearActivity = "idle" | "read" | "eat" | "zoneOut" | "think" | "cheer" | "worried";

export type BearReaction =
  | { readonly kind: "error" }
  | { readonly kind: "thinking" }
  | { readonly kind: "ready"; readonly key: string }
  | null;

export type BearStep =
  /** Played once; afterwards the bear is in `posture`. */
  | { readonly kind: "transition"; readonly animation: BearAnimation; readonly posture: BearPosture }
  /** Played once. */
  | { readonly kind: "once"; readonly animation: BearAnimation }
  /** Repeated until `durationMs` has passed; `null` means until the reaction changes. */
  | { readonly kind: "loop"; readonly animation: BearAnimation; readonly durationMs: number | null }
  /** One frame held still. */
  | { readonly kind: "hold"; readonly animation: BearAnimation; readonly frame: number; readonly durationMs: number };

export interface BearPlan {
  readonly activity: BearActivity;
  readonly steps: readonly BearStep[];
}

export interface BearMemory {
  readonly posture: BearPosture;
  /** Most recent last. */
  readonly history: readonly BearActivity[];
  readonly lastAteAt: number | null;
  /** The Journey state the bear last cheered for, so it cheers once per change. */
  readonly cheeredFor: string | null;
}

export const initialBearMemory: BearMemory = {
  posture: "standing",
  history: [],
  lastAteAt: null,
  cheeredFor: null,
};

type FreeActivity = "read" | "idle" | "eat" | "zoneOut";

const freeTime: Record<FreeActivity, {
  readonly weight: number;
  readonly minMs: number;
  readonly maxMs: number;
  readonly posture: BearPosture;
}> = {
  read: { weight: 45, minMs: 8_000, maxMs: 20_000, posture: "seated" },
  idle: { weight: 25, minMs: 4_000, maxMs: 12_000, posture: "standing" },
  eat: { weight: 20, minMs: 5_000, maxMs: 10_000, posture: "seatedMapDown" },
  zoneOut: { weight: 10, minMs: 10_000, maxMs: 30_000, posture: "seated" },
};

export const mealCooldownMs = 60_000;
const seatedPreference = 1.5;

/** The transitions that carry the bear from one posture to another: it never teleports. */
export function bearTransitions(from: BearPosture, to: BearPosture): BearStep[] {
  const sit: BearStep = { kind: "transition", animation: "sit_down", posture: "seated" };
  const stand: BearStep = { kind: "transition", animation: "stand_up", posture: "standing" };
  const mapDown: BearStep = { kind: "transition", animation: "map_down", posture: "seatedMapDown" };
  const mapUp: BearStep = { kind: "transition", animation: "map_up", posture: "seated" };
  const paths: Record<BearPosture, Record<BearPosture, BearStep[]>> = {
    standing: { standing: [], seated: [sit], seatedMapDown: [sit, mapDown] },
    seated: { standing: [stand], seated: [], seatedMapDown: [mapDown] },
    seatedMapDown: { standing: [mapUp, stand], seated: [mapUp], seatedMapDown: [] },
  };
  return paths[from][to];
}

/** The posture a plan leaves the bear in. */
export function postureAfter(from: BearPosture, steps: readonly BearStep[]): BearPosture {
  return steps.reduce((posture, step) => (step.kind === "transition" ? step.posture : posture), from);
}

export function planNextActivity(
  memory: BearMemory,
  reaction: BearReaction,
  now: number,
  random: () => number,
): BearPlan {
  if (reaction?.kind === "error") {
    return {
      activity: "worried",
      steps: [...bearTransitions(memory.posture, "standing"), { kind: "loop", animation: "worried", durationMs: null }],
    };
  }
  if (reaction?.kind === "thinking") {
    // A reply is short: a standing bear thinks where it is rather than sitting down for it.
    return memory.posture === "standing"
      ? { activity: "think", steps: [{ kind: "loop", animation: "idle", durationMs: null }] }
      : {
        activity: "think",
        steps: [...bearTransitions(memory.posture, "seated"), { kind: "loop", animation: "read", durationMs: null }],
      };
  }
  if (reaction?.kind === "ready" && reaction.key !== memory.cheeredFor) {
    return {
      activity: "cheer",
      steps: [...bearTransitions(memory.posture, "standing"), { kind: "once", animation: "cheer" }],
    };
  }
  return planFreeTime(memory, now, random);
}

function planFreeTime(memory: BearMemory, now: number, random: () => number): BearPlan {
  const activity = pickFreeActivity(memory, now, random);
  const { minMs, maxMs, posture } = freeTime[activity];
  const durationMs = Math.round(minMs + random() * (maxMs - minMs));
  const travel = bearTransitions(memory.posture, posture);
  const main: BearStep = activity === "read"
    ? { kind: "loop", animation: "read", durationMs }
    : activity === "eat"
      ? { kind: "loop", animation: "eat", durationMs }
      : activity === "zoneOut"
        ? { kind: "hold", animation: "read", frame: 0, durationMs }
        : { kind: "loop", animation: "idle", durationMs };
  return { activity, steps: [...travel, main] };
}

/** The weighted draw, after removing what the rules forbid right now. */
export function freeTimeWeights(memory: BearMemory, now: number): Record<FreeActivity, number> {
  const [previous, beforeThat] = [memory.history.at(-1), memory.history.at(-2)];
  const seated = memory.posture !== "standing";
  const weights = {} as Record<FreeActivity, number>;
  for (const activity of Object.keys(freeTime) as FreeActivity[]) {
    let weight = freeTime[activity].weight;
    if (previous === activity && beforeThat === activity) weight = 0;
    if (activity === "eat" && memory.lastAteAt !== null && now - memory.lastAteAt < mealCooldownMs) weight = 0;
    if (seated && freeTime[activity].posture !== "standing") weight *= seatedPreference;
    weights[activity] = weight;
  }
  return weights;
}

function pickFreeActivity(memory: BearMemory, now: number, random: () => number): FreeActivity {
  const weights = Object.entries(freeTimeWeights(memory, now)) as [FreeActivity, number][];
  const total = weights.reduce((sum, [, weight]) => sum + weight, 0);
  let draw = random() * total;
  for (const [activity, weight] of weights) {
    if (draw < weight) return activity;
    draw -= weight;
  }
  return "idle";
}

/** What the bear remembers once a plan has been chosen. */
export function rememberPlan(memory: BearMemory, plan: BearPlan, reaction: BearReaction, now: number): BearMemory {
  return {
    posture: memory.posture,
    history: [...memory.history, plan.activity].slice(-5),
    lastAteAt: plan.activity === "eat" ? now : memory.lastAteAt,
    cheeredFor: plan.activity === "cheer" && reaction?.kind === "ready" ? reaction.key : memory.cheeredFor,
  };
}
