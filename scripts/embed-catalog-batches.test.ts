import assert from "node:assert/strict";
import test from "node:test";

import { embeddingBatches } from "./embed-catalog-batches";

test("rows go out twenty at a time, in order, the last batch short", () => {
  const rows = Array.from({ length: 45 }, (_, index) => ({ id: `spot_${index}`, searchText: `文本${index}` }));
  const batches = embeddingBatches(rows, 20);
  assert.deepEqual(batches.map((batch) => batch.length), [20, 20, 5]);
  assert.equal(batches[2][4].id, "spot_44");
  assert.deepEqual(embeddingBatches([], 20), []);
  assert.throws(() => embeddingBatches(rows, 0));
});
