import assert from "node:assert/strict";
import test from "node:test";

import { addPreferences } from "./plan-memories-model";

test("adds trimmed preferences once, skipping what Meri already remembers", () => {
  let next = 0;
  const now = new Date("2026-11-12T09:00:00.000Z");
  const added = addPreferences([], ["  少走路 ", "带小孩", "少走路", "", "不吃辣"], ["不吃辣"], now, () => `id-${++next}`);
  assert.deepEqual(added, [
    { id: "id-1", text: "少走路", addedAt: "2026-11-12T09:00:00.000Z" },
    { id: "id-2", text: "带小孩", addedAt: "2026-11-12T09:00:00.000Z" },
  ]);
  assert.deepEqual(addPreferences(added, ["带小孩"], [], now, () => "unused"), added);
});

test("keeps at most twenty added preferences of up to eighty characters", () => {
  let next = 0;
  const many = Array.from({ length: 25 }, (_, index) => `偏好${index}`);
  const added = addPreferences([], many, [], new Date(), () => `id-${++next}`);
  assert.equal(added.length, 20);
  assert.equal(addPreferences([], ["长".repeat(100)], [], new Date(), () => "x")[0].text.length, 80);
});
