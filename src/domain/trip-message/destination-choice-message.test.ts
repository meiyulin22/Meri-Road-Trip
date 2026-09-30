import assert from "node:assert/strict";
import test from "node:test";

import { validateTripMessage } from "./trip-message";

const base = { id: "m1", tripId: "t1", role: "assistant", content: "找到地点了",
  createdAt: "2026-09-29T00:00:00.000Z" };

test("new destination offer survives persistence validation with spot and replace version", () => {
  const message = validateTripMessage({ ...base, presentation: { type: "destination_choices", mode: "replace",
    baseDestination: '{"state":"missing"}', choices: [{ id: "amap1", name: "梅里雪山",
      province: "云南省", city: "迪庆藏族自治州", spot: "梅里雪山" }] } });
  assert.equal(message.presentation?.type, "destination_choices");
  if (message.presentation?.type === "destination_choices") {
    assert.equal(message.presentation.choices[0].spot, "梅里雪山");
    assert.equal(message.presentation.baseDestination, '{"state":"missing"}');
  }
});

test("legacy location candidates remain validated and readable", () => {
  const message = validateTripMessage({ ...base, presentation: { type: "location_candidates",
    candidates: [{ providerId: "old-id", name: "梅里雪山", region: "云南省", address: "德钦",
      longitude: 98.6, latitude: 28.4, coordinateSystem: "GCJ-02" }] } });
  assert.equal(message.presentation?.type, "location_candidates");
  if (message.presentation?.type === "location_candidates") {
    assert.equal(message.presentation.candidates[0].city, null);
  }
});
