import assert from "node:assert/strict";
import test from "node:test";

import { between, fitView, onScreen, project } from "./plan-map-model";

test("north is up and east is right", () => {
  const lijiang = project([100.233, 26.874]);
  const dali = project([100.163, 25.693]);
  assert.ok(dali.y > lijiang.y);
  assert.ok(dali.x < lijiang.x);
});

test("a framed set of places lands inside the box, padding kept, and a single town is not zoomed in without limit", () => {
  const points = [project([100.205, 27.103]), project([100.233, 26.874]), project([100.214, 26.948])];
  const view = fitView(points, 400, 500, 40);
  for (const point of points) {
    const shown = onScreen(point, view);
    assert.ok(shown.x >= 39.9 && shown.x <= 360.1 && shown.y >= 39.9 && shown.y <= 460.1, JSON.stringify(shown));
  }
  assert.equal(fitView([project([100.233, 26.874])], 400, 500, 40).scale, 3);
});

test("the camera glides from one view to the next", () => {
  const from = { scale: 1, x: 0, y: 0 };
  const to = { scale: 3, x: 100, y: -50 };
  assert.deepEqual(between(from, to, 0), from);
  assert.deepEqual(between(from, to, 1), to);
  assert.deepEqual(between(from, to, 0.5), { scale: 2, x: 50, y: -25 });
});
