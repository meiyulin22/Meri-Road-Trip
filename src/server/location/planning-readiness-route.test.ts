import assert from "node:assert/strict";
import test from "node:test";

import type { TripState } from "@/domain/trip-state/trip-state";
import { TripNotFoundError } from "@/domain/trip/trip-errors";
import { TripStateNotFoundError } from "@/server/journey/journey-errors";

import { handlePlanningReadinessGet } from "@/app/api/trips/[id]/planning-readiness/route";

const tripState: TripState = {
  name: { state: "known", value: "旅程", source: "user" },
  origin: { state: "missing" },
  destination: { state: "known", value: "云南", source: "user" },
  startDate: { state: "missing" },
  endDate: { state: "missing" },
  duration: { state: "missing" },
  transportPreference: { state: "missing" },
};

test("no owner returns 404 before loading or resolving", async () => {
  const response = await handlePlanningReadinessGet("trip-id", null,
    async () => { throw new Error("must not load"); },
    async () => { throw new Error("must not resolve"); },
  );
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error.code, "journey_not_found");
});

for (const error of [new TripNotFoundError("trip-id"), new TripStateNotFoundError("trip-id")]) {
  test(`${error.name} returns 404 without resolving`, async () => {
    const response = await handlePlanningReadinessGet("trip-id", "owner-id",
      async () => { throw error; },
      async () => { throw new Error("must not resolve"); },
    );
    assert.equal(response.status, 404);
    assert.equal((await response.json()).error.code, "journey_not_found");
  });
}

test("owned Journey uses freshly loaded authoritative TripState and returns only readiness", async () => {
  const response = await handlePlanningReadinessGet("trip-id", "owner-id",
    async (tripId, ownerGuestId) => {
      assert.equal(tripId, "trip-id");
      assert.equal(ownerGuestId, "owner-id");
      return { tripState };
    },
    async (loaded) => {
      assert.equal(loaded, tripState);
      return { canProceed: true, destination: "resolved" };
    },
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await response.json(), { canProceed: true, destination: "resolved" });
});
