import assert from "node:assert/strict";
import test from "node:test";

import {
  InvalidTripMessageError,
  validateTripMessage,
} from "./trip-message";

const message = {
  id: "12e59c29-1afd-4ca7-8688-11bc25dcaad7",
  tripId: "3d17d2c7-fd9b-4748-b751-3a76a9a920be",
  role: "assistant",
  content: "好的，我们继续规划。",
  createdAt: "2026-09-21T08:00:00.000Z",
};

test("validates a focused TripMessage", () => {
  assert.deepEqual(validateTripMessage(message), message);
});

test("rejects invalid roles and empty content", () => {
  assert.throws(
    () => validateTripMessage({ ...message, role: "system" }),
    InvalidTripMessageError,
  );
  assert.throws(
    () => validateTripMessage({ ...message, content: "  " }),
    InvalidTripMessageError,
  );
});

test("validates structured assistant presentation and keeps plain messages compatible", () => {
  const presentation = { type: "destination_recommendations", destinations: [
    { id: "a", name: "香格里拉", region: "云南", reason: "适合探索", imageUrl: null },
    { id: "b", name: "阿尔山", region: "内蒙古", reason: "适合徒步", imageUrl: null },
    { id: "c", name: "大理", region: "云南", reason: "节奏灵活", imageUrl: null },
  ] };
  assert.deepEqual(validateTripMessage({ ...message, presentation }).presentation, presentation);
  assert.equal(validateTripMessage(message).presentation, undefined);
  assert.throws(() => validateTripMessage({ ...message, role: "user", presentation }), InvalidTripMessageError);
  assert.throws(() => validateTripMessage({ ...message, presentation: { ...presentation, destinations: presentation.destinations.slice(0, 2) } }), InvalidTripMessageError);
  assert.throws(() => validateTripMessage({ ...message, presentation: { ...presentation, destinations: [presentation.destinations[0], presentation.destinations[0], presentation.destinations[2]] } }), InvalidTripMessageError);
});
