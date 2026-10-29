import assert from "node:assert/strict";
import test from "node:test";

import { nextBlinkDelay, pupilOffset, typingTarget } from "./red-panda-peek-model";

const eye = { x: 100, y: 100 };

test("the pupil points at the target in every direction, all the way round", () => {
  for (let degrees = 0; degrees < 360; degrees += 45) {
    const angle = (degrees * Math.PI) / 180;
    const target = { x: eye.x + Math.cos(angle) * 500, y: eye.y + Math.sin(angle) * 500 };
    const offset = pupilOffset(eye, target, 6, 300);
    assert.ok(Math.abs(Math.atan2(offset.y, offset.x) - Math.atan2(target.y - eye.y, target.x - eye.x)) < 1e-9 ||
      Math.abs(Math.abs(Math.atan2(offset.y, offset.x) - Math.atan2(target.y - eye.y, target.x - eye.x)) - 2 * Math.PI) < 1e-9, `${degrees}°`);
    assert.ok(Math.abs(Math.hypot(offset.x, offset.y) - 6) < 1e-9, `${degrees}° reaches the edge`);
  }
});

test("a near target leans the pupil only part way, and one on the eye leaves it centred", () => {
  const near = pupilOffset(eye, { x: 250, y: 100 }, 6, 300);
  assert.equal(near.y, 0);
  assert.ok(Math.abs(near.x - 3) < 1e-9);
  assert.deepEqual(pupilOffset(eye, { x: 100.5, y: 100 }, 6, 300), { x: 0, y: 0 });
  assert.deepEqual(pupilOffset(eye, { x: 400, y: 100 }, 0, 300), { x: 0, y: 0 });
});

test("blinks come every 2.5 to 6 seconds", () => {
  assert.equal(nextBlinkDelay(() => 0), 2500);
  assert.equal(nextBlinkDelay(() => 0.999999), 5999);
});

test("while typing, the panda reads along the text and never past its end", () => {
  const box = { left: 0, top: 0, width: 400, height: 60 };
  assert.deepEqual(typingTarget(box, 0), { x: 40, y: 30 });
  assert.ok(typingTarget(box, 20).x > typingTarget(box, 5).x);
  assert.equal(typingTarget(box, 10_000).x, 340);
});
