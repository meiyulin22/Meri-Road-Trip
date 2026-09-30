import assert from "node:assert/strict";
import test from "node:test";

import { destinationText, validateTripState } from "./trip-state";

test("old free-text destination remains readable without pretending a POI is a city", () => {
  const state = validateTripState({
    name: { state: "missing" }, origin: { state: "missing" },
    destination: { state: "known", value: "浙江省 丽水松阳古村落群", source: "user",
      areas: [{ province: "浙江省", places: ["丽水松阳古村落群"] }] },
    startDate: { state: "missing" }, endDate: { state: "missing" },
    duration: { state: "missing" }, transportPreference: { state: "missing" },
  });
  assert.equal(destinationText(state.destination), "浙江省 丽水松阳古村落群");
  assert.deepEqual(state.destination.state === "known" && state.destination.areas, []);
  assert.equal(state.destination.state === "known" && state.destination.legacyText,
    "浙江省 丽水松阳古村落群");
});
