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
