import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { frameFor, poseToward, typingTarget, type TurnFrames } from "./red-panda-peek-model";

// Shaped like the real frames: full turns on the four axes, a circle round them, and
// lower corners that only turn a little.
const frames: TurnFrames = { front: 0, looks: [
  [0, 0], [-1, 0], [1, 0], [0, -1], [0, 1],
  [-0.5, 0], [0, 0.5], [-0.7, -0.7], [0.7, -0.7], [0.3, 0.25], [-0.3, 0.25], [-0.2, 0.15] ] };

test("a pointer far off turns the head fully that way, one on the face leaves it straight ahead", () => {
  const face = { x: 500, y: 300 };
  const reach = { x: 400, y: 250 };
  assert.deepEqual(poseToward(face, { x: 0, y: 300 }, reach), { x: -1, y: 0 });
  assert.deepEqual(poseToward(face, { x: 2000, y: 1000 }, reach), { x: 1, y: 1 });
  assert.deepEqual(poseToward(face, { x: 700, y: 175 }, reach), { x: 0.5, y: -0.5 });
  assert.deepEqual(poseToward(face, face, reach), { x: 0, y: 0 });
});

test("each way shows the frame that looks that way, and ahead is the front", () => {
  assert.equal(frameFor({ x: 0, y: 0 }, frames), 0);
  assert.equal(frameFor({ x: -1, y: 0 }, frames), 1);
  assert.equal(frameFor({ x: 1, y: 0 }, frames), 2);
  assert.equal(frameFor({ x: 0, y: -1 }, frames), 3);
  assert.equal(frameFor({ x: 0, y: 1 }, frames), 4);
  assert.equal(frameFor({ x: -0.5, y: 0 }, frames), 5);
  assert.equal(frameFor({ x: -1, y: -1 }, frames), 7);
});

test("a look down-left shows the down-left frame, not the full look down, though it turns less", () => {
  assert.equal(frameFor({ x: -1, y: 1 }, frames), 10);
  assert.equal(frameFor({ x: 1, y: 1 }, frames), 9);
});

test("the frame showing stays until another is clearly nearer", () => {
  const between = { x: -0.75, y: 0 };
  assert.equal(frameFor(between, frames, 1), 1);
  assert.equal(frameFor(between, frames, 5), 5);
  assert.equal(frameFor({ x: -1, y: 0 }, frames, 5), 1);
});

test("with the real frames, sweeping round the panda steps between nearby looks, never across the face", () => {
  const real = JSON.parse(readFileSync(new URL("../../../public/companion/red-panda/turns.json", import.meta.url), "utf8")) as TurnFrames;
  let previous = frameFor({ x: 1, y: 0 }, real);
  const seen = new Set<number>();
  for (let degrees = 1; degrees <= 360; degrees += 1) {
    const angle = (degrees * Math.PI) / 180;
    const index = frameFor({ x: Math.cos(angle), y: Math.sin(angle) }, real, previous);
    const [x0, y0] = real.looks[previous];
    const [x1, y1] = real.looks[index];
    assert.ok(Math.hypot(x1 - x0, y1 - y0) < 0.6, `${degrees}°: frame ${previous} → ${index}`);
    previous = index;
    seen.add(index);
  }
  // Down-left really is drawn: some frame looks both left and down.
  assert.ok([...seen].some((index) => real.looks[index][0] < -0.2 && real.looks[index][1] > 0.1));
});

test("while typing, the panda reads along the text and never past its end", () => {
  const box = { left: 0, top: 0, width: 400, height: 60 };
  assert.deepEqual(typingTarget(box, 0), { x: 40, y: 30 });
  assert.ok(typingTarget(box, 20).x > typingTarget(box, 5).x);
  assert.equal(typingTarget(box, 10_000).x, 340);
});
