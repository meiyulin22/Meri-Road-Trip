import assert from "node:assert/strict";
import test from "node:test";

import { handleDestinationMissingGuidancePost, isValidJourneyId } from "@/app/api/trips/[id]/destination-missing-guidance/route";
import type { TripMessage } from "@/domain/trip-message/trip-message";
import type { TripState } from "@/domain/trip-state/trip-state";
import { TripNotFoundError } from "@/domain/trip/trip-errors";

const tripId = "3d17d2c7-fd9b-4748-b751-3a76a9a920be";

test("guidance route accepts a standard Journey UUID", () => {
  assert.equal(isValidJourneyId(tripId), true);
  assert.equal(isValidJourneyId("not-a-uuid"), false);
});
const state: TripState = {
  name: { state: "missing" }, origin: { state: "missing" }, destination: { state: "missing" },
  startDate: { state: "missing" }, endDate: { state: "missing" },
  duration: { state: "missing" }, transportPreference: { state: "missing" },
};
const message: TripMessage = {
  id: "00000000-0000-4000-8000-000000000001", tripId,
  role: "assistant", content: "还没想好去哪吗？我可以根据你的旅行偏好推荐几个地方。",
  createdAt: "2026-09-25T01:00:00.000Z",
};

test("owned missing destination persists guidance and returns the assistant message", async () => {
  let writes = 0;
  const result = await handleDestinationMissingGuidancePost(tripId, "owner",
    async (id, owner) => { assert.equal(id, tripId); assert.equal(owner, "owner"); return { tripState: state }; },
    async () => { writes += 1; return message; },
  );
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { message });
  assert.equal(writes, 1);
});

test("a destination that is no longer missing prevents guidance creation", async () => {
  const result = await handleDestinationMissingGuidancePost(tripId, "owner",
    async () => ({ tripState: { ...state, destination: { state: "known", value: "云南", source: "user" } } }),
    async () => { throw new Error("must not persist"); },
  );
  assert.equal(result.status, 409);
  assert.equal((await result.json()).error.code, "destination_not_missing");
});

test("missing owner and wrong owner do not persist guidance", async () => {
  const noOwner = await handleDestinationMissingGuidancePost(tripId, null,
    async () => { throw new Error("must not load"); },
    async () => { throw new Error("must not persist"); },
  );
  assert.equal(noOwner.status, 404);
  const wrongOwner = await handleDestinationMissingGuidancePost(tripId, "wrong",
    async () => { throw new TripNotFoundError(tripId); },
    async () => { throw new Error("must not persist"); },
  );
  assert.equal(wrongOwner.status, 404);
});
