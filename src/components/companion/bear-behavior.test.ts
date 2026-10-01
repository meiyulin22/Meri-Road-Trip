import assert from "node:assert/strict";
import test from "node:test";

import {
  bearTransitions,
  freeTimeWeights,
  initialBearMemory,
  mealCooldownMs,
  planNextActivity,
  postureAfter,
  rememberPlan,
  type BearMemory,
  type BearPosture,
  type BearReaction,
} from "./bear-behavior";
import { bearAnimations, bearSpriteSheet, parseBearSpriteSheet } from "./bear-sprite-sheet";

/** A repeatable stand-in for Math.random. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 2 ** 32;
    return state / 2 ** 32;
  };
}

const postureOf: Record<string, BearPosture> = {
  read: "seated", eat: "seatedMapDown", zoneOut: "seated", idle: "standing", cheer: "standing", worried: "standing",
};

test("the bear never teleports: every posture change is a played transition", () => {
  assert.deepEqual(bearTransitions("standing", "seatedMapDown").map((step) => step.kind === "transition" && step.animation),
    ["sit_down", "map_down"]);
  assert.deepEqual(bearTransitions("seatedMapDown", "standing").map((step) => step.kind === "transition" && step.animation),
    ["map_up", "stand_up"]);
  assert.deepEqual(bearTransitions("seated", "seated"), []);
  // Hundreds of random plans in a row always start where the last one left off.
  const random = seeded(7);
  let memory: BearMemory = initialBearMemory;
  let now = 0;
  for (let index = 0; index < 400; index += 1) {
    const plan = planNextActivity(memory, null, now, random);
    const posture = postureAfter(memory.posture, plan.steps);
    assert.equal(posture, postureOf[plan.activity], `${plan.activity} from ${memory.posture}`);
    memory = { ...rememberPlan(memory, plan, null, now), posture };
    now += 15_000;
  }
});

test("free time never repeats one activity three times in a row and eats at most once a minute", () => {
  const random = seeded(42);
  let memory: BearMemory = initialBearMemory;
  let now = 0;
  const activities: string[] = [];
  const meals: number[] = [];
  for (let index = 0; index < 600; index += 1) {
    const plan = planNextActivity(memory, null, now, random);
    activities.push(plan.activity);
    if (plan.activity === "eat") meals.push(now);
    memory = { ...rememberPlan(memory, plan, null, now), posture: postureAfter(memory.posture, plan.steps) };
    now += 12_000;
  }
  for (let index = 2; index < activities.length; index += 1) {
    assert.ok(!(activities[index] === activities[index - 1] && activities[index] === activities[index - 2]),
      `three ${activities[index]} in a row at ${index}`);
  }
  for (let index = 1; index < meals.length; index += 1) assert.ok(meals[index] - meals[index - 1] >= mealCooldownMs);
  // Every free-time activity actually happens.
  for (const activity of ["read", "idle", "eat", "zoneOut"]) assert.ok(activities.includes(activity), activity);
});

test("a seated bear prefers to stay seated, and a fresh meal takes eating off the menu", () => {
  const standing = freeTimeWeights(initialBearMemory, 0);
  const seated = freeTimeWeights({ ...initialBearMemory, posture: "seated" }, 0);
  assert.equal(seated.read, standing.read * 1.5);
  assert.equal(seated.idle, standing.idle);
  assert.equal(freeTimeWeights({ ...initialBearMemory, lastAteAt: 0 }, mealCooldownMs - 1).eat, 0);
  assert.ok(freeTimeWeights({ ...initialBearMemory, lastAteAt: 0 }, mealCooldownMs).eat > 0);
});

test("reactions outrank free time and walk the bear to the right posture first", () => {
  const seatedEating: BearMemory = { ...initialBearMemory, posture: "seatedMapDown" };
  const always = () => 0;
  const worried = planNextActivity(seatedEating, { kind: "error" }, 0, always);
  assert.equal(worried.activity, "worried");
  assert.deepEqual(worried.steps.map((step) => step.animation), ["map_up", "stand_up", "worried"]);
  assert.deepEqual(worried.steps.at(-1), { kind: "loop", animation: "worried", durationMs: null });

  const thinkingSeated = planNextActivity(seatedEating, { kind: "thinking" }, 0, always);
  assert.deepEqual(thinkingSeated.steps.map((step) => step.animation), ["map_up", "read"]);
  const thinkingStanding = planNextActivity(initialBearMemory, { kind: "thinking" }, 0, always);
  assert.deepEqual(thinkingStanding.steps.map((step) => step.animation), ["idle"]);
});

test("the bear cheers once for a ready Journey, and again only when the Journey changes", () => {
  const ready: BearReaction = { kind: "ready", key: "trip-v1" };
  const cheer = planNextActivity({ ...initialBearMemory, posture: "seated" }, ready, 0, seeded(1));
  assert.equal(cheer.activity, "cheer");
  assert.deepEqual(cheer.steps.map((step) => step.animation), ["stand_up", "cheer"]);
  const afterCheer = { ...rememberPlan(initialBearMemory, cheer, ready, 0), posture: "standing" as const };
  assert.notEqual(planNextActivity(afterCheer, ready, 1, seeded(1)).activity, "cheer");
  assert.equal(planNextActivity(afterCheer, { kind: "ready", key: "trip-v2" }, 1, seeded(1)).activity, "cheer");
});

test("the generated sprite sheet has every animation the behaviour plays, one duration per frame", () => {
  assert.deepEqual(Object.keys(bearSpriteSheet.animations).sort(), [...bearAnimations].sort());
  assert.equal(bearSpriteSheet.columns, 7);
  assert.equal(bearSpriteSheet.rows, bearAnimations.length);
  assert.throws(() => parseBearSpriteSheet({ frameWidth: 74, frameHeight: 76, animations: {} }));
  assert.throws(() => parseBearSpriteSheet({ frameWidth: 74, frameHeight: 76, animations: {
    ...bearSpriteSheet.animations, idle: { row: 0, frames: 2, durationsMs: [100] },
  } }));
});
