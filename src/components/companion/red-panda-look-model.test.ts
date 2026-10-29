import assert from "node:assert/strict";
import test from "node:test";

import { canTrackPointer, gridFrame, neutralPosition, pointerPosition, type LookGrid } from "./red-panda-look-model";

const grid: LookGrid = { columns: 17, rows: 17, yaw: { min: -25, max: 25 }, pitch: { min: -18, max: 18 } };
const face = { x: 500, y: 300 };
const viewport = { width: 1000, height: 600 };

test("the face center is the neutral cell; cardinal directions and diagonals have their own cells", () => {
  assert.deepEqual(pointerPosition(face, face, viewport, grid), { x: 8, y: 8 });
  const cases = [
    [{ x: -5000, y: 300 }, 136], [{ x: 6000, y: 300 }, 152],
    [{ x: 500, y: -5000 }, 8], [{ x: 500, y: 6000 }, 280],
    [{ x: -5000, y: -5000 }, 0], [{ x: 6000, y: -5000 }, 16],
    [{ x: -5000, y: 6000 }, 272], [{ x: 6000, y: 6000 }, 288],
  ] as const;
  for (const [target, expected] of cases) assert.equal(gridFrame(pointerPosition(face, target, viewport, grid), grid), expected);
});

test("small pointer moves produce small continuous parameter changes before cell selection", () => {
  const near = pointerPosition(face, { x: 510, y: 300 }, viewport, grid);
  const further = pointerPosition(face, { x: 520, y: 300 }, viewport, grid);
  assert.ok(near.x > 8 && near.x < further.x && further.x < 10);
  assert.equal(near.y, 8);
  assert.equal(further.y, 8);
  const movedFace = { x: 520, y: 300 };
  assert.deepEqual(pointerPosition(movedFace, movedFace, viewport, grid), neutralPosition(grid));
});

test("rectangular grids use the actual row stride and clamp every cell within the atlas", () => {
  const rectangular = { ...grid, columns: 5, rows: 3 };
  assert.equal(gridFrame({ x: 100, y: 100 }, rectangular), 14);
  assert.equal(gridFrame({ x: -100, y: -100 }, rectangular), 0);
  assert.equal(gridFrame({ x: 2, y: 1 }, rectangular), 7);
  assert.equal(gridFrame({ x: NaN, y: NaN }, rectangular), 7);
  assert.deepEqual(pointerPosition(face, { x: NaN, y: 0 }, viewport, grid), neutralPosition(grid));
});

test("tracking stops outside the active visible fine-pointer state, including reduced motion", () => {
  const active = { active: true, visible: true, inView: true, finePointer: true, reducedMotion: false };
  assert.equal(canTrackPointer(active), true);
  for (const key of ["active", "visible", "inView", "finePointer"] as const) assert.equal(canTrackPointer({ ...active, [key]: false }), false);
  assert.equal(canTrackPointer({ ...active, reducedMotion: true }), false);
});
