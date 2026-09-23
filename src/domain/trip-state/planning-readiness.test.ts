import assert from "node:assert/strict";
import test from "node:test";

import { evaluatePlanningReadiness } from "./planning-readiness";
import type { TripState, TripStateField } from "./trip-state";

const baseState: TripState = {
  name: { state: "known", value: "冬季旅行", source: "user" },
  origin: { state: "missing" },
  destination: { state: "missing" },
  startDate: { state: "missing" },
  endDate: { state: "missing" },
  duration: { state: "missing" },
  transportPreference: { state: "missing" },
};

const cases: {
  name: string;
  destination: TripStateField;
  expected: ReturnType<typeof evaluatePlanningReadiness>;
}[] = [
  {
    name: "missing destination",
    destination: { state: "missing" },
    expected: {
      locationResolve: {
        canAttempt: false,
        reason: "destination_missing",
      },
    },
  },
  {
    name: "known destination",
    destination: { state: "known", value: "富良野", source: "user" },
    expected: { locationResolve: { canAttempt: true } },
  },
  {
    name: "approximate destination",
    destination: {
      state: "approximate",
      value: "北海道附近",
      source: "user",
    },
    expected: { locationResolve: { canAttempt: true } },
  },
  {
    name: "ambiguous destination",
    destination: {
      state: "ambiguous",
      value: "二世谷或者富良野",
      source: "user",
    },
    expected: { locationResolve: { canAttempt: true } },
  },
];

for (const { name, destination, expected } of cases) {
  test(`evaluates locationResolve readiness for ${name} without mutating TripState`, () => {
    const tripState: TripState = { ...baseState, destination };
    const originalState = structuredClone(tripState);

    assert.deepEqual(evaluatePlanningReadiness(tripState), expected);
    assert.deepEqual(tripState, originalState);
  });
}
