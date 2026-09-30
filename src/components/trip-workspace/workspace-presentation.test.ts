import assert from "node:assert/strict";
import test from "node:test";

import type { DestinationField } from "@/domain/trip-state/trip-state";

import { destinationSummaryLabel } from "./workspace-presentation";

const missingLabel = "目的地待定";

test("a missing destination is the caller's own placeholder and reveals nothing", () => {
  const label = destinationSummaryLabel({ state: "missing" }, missingLabel);
  assert.deepEqual(label, { text: missingLabel, detail: null, placeCount: 0 });
});

test("a destination with no structure shows its own text, with nothing held back", () => {
  // Destinations written before areas existed, and destinations the user typed as
  // free text, have only `value` — and it is already the whole answer.
  const label = destinationSummaryLabel(
    { state: "known", source: "user", areas:[], legacyText:"二世谷" },
    missingLabel,
  );
  assert.deepEqual(label, { text: "二世谷", detail: "旧旅程记录，地点尚待重新确认", placeCount: 0 });
});

test("provinces with no place chosen inside them are the whole answer already", () => {
  const destination: DestinationField = {
    state: "known", source: "user",
    areas: [{ province: "海南省", places: [] }],
  };
  assert.deepEqual(destinationSummaryLabel(destination, missingLabel),
    { text: "海南省", detail: null, placeCount: 0 });
});

test("places across provinces summarise to the provinces and keep every place for the reveal", () => {
  const destination: DestinationField = {
    state: "known", source: "user",
    areas: [
      { province: "广西壮族自治区", places: [{name:"北海市",spots:[]}] },
      { province: "浙江省", places: [{name:"舟山市",spots:[]}, {name:"台州市",spots:[]}] },
    ],
  };
  const label = destinationSummaryLabel(destination, missingLabel);
  assert.equal(label.text, "广西壮族自治区、浙江省");
  assert.equal(label.detail, "广西壮族自治区 北海市 · 浙江省 舟山市、台州市");
  assert.equal(label.placeCount, 3);
});

test("one place in one province still reveals the place the provinces omit", () => {
  const destination: DestinationField = {
    state: "known", source: "user",
    areas: [{ province: "四川省", places: [{name:"稻城县",spots:[]}] }],
  };
  const label = destinationSummaryLabel(destination, missingLabel);
  assert.equal(label.text, "四川省");
  assert.equal(label.detail, "四川省 稻城县");
  assert.equal(label.placeCount, 1);
});
