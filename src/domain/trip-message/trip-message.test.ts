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
  for (const count of [1, 2, 3]) {
    assert.equal(validateTripMessage({ ...message, presentation: { ...presentation,
      destinations: presentation.destinations.slice(0, count) } }).presentation?.type, "destination_recommendations");
  }
  assert.throws(() => validateTripMessage({ ...message, presentation: { ...presentation, destinations: [] } }), InvalidTripMessageError);
  assert.throws(() => validateTripMessage({ ...message, presentation: { ...presentation,
    destinations: [...presentation.destinations, { id: "d", name: "额外", region: null, reason: "额外", imageUrl: null }] } }), InvalidTripMessageError);
  assert.throws(() => validateTripMessage({ ...message, presentation: { ...presentation, destinations: [presentation.destinations[0], presentation.destinations[0], presentation.destinations[2]] } }), InvalidTripMessageError);
});

test("validates provider-returned location candidate presentation without accepting arbitrary shapes", () => {
  const candidate = { providerId: "poi-1", name: "吉林市",
    province: "吉林省", city: "吉林市", district: null, region: "吉林省", address: null,
    longitude: 126.55, latitude: 43.84, coordinateSystem: "GCJ-02" };
  const presentation = { type: "location_candidates", candidates: [candidate, { ...candidate, providerId: "poi-2" }] };
  assert.deepEqual(validateTripMessage({ ...message, presentation }).presentation, presentation);
  assert.throws(() => validateTripMessage({ ...message, role: "user", presentation }), InvalidTripMessageError);
  assert.deepEqual(validateTripMessage({ ...message, presentation: { ...presentation, candidates: [candidate] } }).presentation,
    { ...presentation, candidates: [candidate] });
  assert.throws(() => validateTripMessage({ ...message, presentation: { ...presentation, candidates: [] } }), InvalidTripMessageError);
  assert.throws(() => validateTripMessage({ ...message, presentation: { ...presentation, candidates: [candidate, candidate] } }), InvalidTripMessageError);
  assert.throws(() => validateTripMessage({ ...message, presentation: { ...presentation, candidates: [candidate, { ...candidate, providerId: "" }] } }), InvalidTripMessageError);
});

test("a candidate stored before the administrative levels existed still opens", () => {
  // A Journey saved then has no such keys, and it still has to open, so an absent
  // level reads as an unknown one rather than as a corrupt message.
  const stored = { providerId: "poi-1", name: "吉林市", region: "吉林省", address: null,
    longitude: 126.55, latitude: 43.84, coordinateSystem: "GCJ-02" };
  assert.deepEqual(validateTripMessage({ ...message,
    presentation: { type: "location_candidates", candidates: [stored] } }).presentation, {
    type: "location_candidates",
    candidates: [{ ...stored, province: null, city: null, district: null }],
  });
  // Present but blank is a corrupt level, not an absent one.
  assert.throws(() => validateTripMessage({ ...message, presentation: { type: "location_candidates",
    candidates: [{ ...stored, province: "  " }] } }), InvalidTripMessageError);
  assert.throws(() => validateTripMessage({ ...message, presentation: { type: "location_candidates",
    candidates: [{ ...stored, prov: "吉林省" }] } }), InvalidTripMessageError);
});
