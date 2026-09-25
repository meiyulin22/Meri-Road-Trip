import assert from "node:assert/strict";
import test from "node:test";

import type { Journey } from "./journey-service";
import { createJourneyWithOpening } from "./create-journey-with-opening";

const journey: Journey = {
  trip: {
    id: "3d17d2c7-fd9b-4748-b751-3a76a9a920be",
    status: "idea",
    createdAt: "2026-09-25T01:00:00.000Z",
    updatedAt: "2026-09-25T01:00:00.000Z",
  },
  tripState: {
    name: { state: "known", value: "日本滑雪", source: "system" },
    origin: { state: "missing" },
    destination: { state: "known", value: "日本", source: "user" },
    startDate: { state: "missing" },
    endDate: { state: "missing" },
    duration: { state: "missing" },
    transportPreference: { state: "missing" },
  },
};
const input = {
  draft: { destination: "structured draft" },
  ownerGuestId: "25ba5b26-8db0-4fe3-bfcc-b684dd7889cc",
  initialUserMessage: "Original Home idea",
  requestId: "request-1",
  referenceDate: "2026-09-25",
  timezone: "Asia/Shanghai",
};

test("creates Journey and initial user before generating the opening reply", async () => {
  const order: string[] = [];
  const result = await createJourneyWithOpening(input, {
    async createJourney(draft, owner, message) {
      order.push("journey-and-user");
      assert.strictEqual(draft, input.draft);
      assert.equal(owner, input.ownerGuestId);
      assert.equal(message, input.initialUserMessage);
      return journey;
    },
    async initializeOpening(request) {
      order.push("assistant");
      assert.equal(request.tripId, journey.trip.id);
    },
  });
  assert.deepEqual(order, ["journey-and-user", "assistant"]);
  assert.equal(result.opening, "completed");
});

test("AI failure leaves the created Journey available", async () => {
  const aiError = new Error("model unavailable");
  const result = await createJourneyWithOpening(input, {
    async createJourney() { return journey; },
    async initializeOpening() { throw aiError; },
  });
  assert.strictEqual(result.journey, journey);
  assert.equal(result.opening, "failed");
  assert.equal(result.openingError, aiError);
});

test("creation failure does not call AI and absent initial message does not need one", async () => {
  let calls = 0;
  await assert.rejects(createJourneyWithOpening(input, {
    async createJourney() { throw new Error("initial user insert failed"); },
    async initializeOpening() { calls += 1; },
  }));
  const result = await createJourneyWithOpening({ ...input, initialUserMessage: undefined }, {
    async createJourney() { return journey; },
    async initializeOpening() { calls += 1; },
  });
  assert.equal(calls, 0);
  assert.equal(result.opening, "not_requested");
});
