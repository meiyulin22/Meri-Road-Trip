import assert from "node:assert/strict";
import test from "node:test";

import {
  InvalidTripMessageError,
  recommendationsAwaitingPhoto,
  validateTripMessage,
  type DestinationRecommendationPresentation,
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
    { id: "a", name: "丽江市", province: "云南省", reason: "适合探索" },
    { id: "b", name: "阿拉善盟", province: "内蒙古自治区", reason: "适合徒步" },
    { id: "c", name: "大理白族自治州", province: "云南省", reason: "节奏灵活" },
  ] };
  assert.deepEqual(validateTripMessage({ ...message, presentation }).presentation, presentation);
  assert.equal(validateTripMessage(message).presentation, undefined);
  assert.throws(() => validateTripMessage({ ...message, role: "user", presentation }), InvalidTripMessageError);
  for (const count of [1, 2, 3]) {
    assert.equal(validateTripMessage({ ...message, presentation: { ...presentation,
      destinations: presentation.destinations.slice(0, count) } }).presentation?.type, "destination_recommendations");
  }
  const twelve = Array.from({ length: 12 }, (_, index) =>
    ({ id: `p${index}`, name: `第${index}市`, province: "云南省", reason: "适合探索" }));
  assert.equal(validateTripMessage({ ...message,
    presentation: { ...presentation, destinations: twelve } }).presentation?.type, "destination_recommendations");
  assert.throws(() => validateTripMessage({ ...message, presentation: { ...presentation, destinations: [] } }), InvalidTripMessageError);
  assert.throws(() => validateTripMessage({ ...message, presentation: { ...presentation,
    destinations: [...twelve, { id: "p12", name: "第十三市", province: "云南省", reason: "额外" }] } }), InvalidTripMessageError);
  assert.throws(() => validateTripMessage({ ...message, presentation: { ...presentation, destinations: [presentation.destinations[0], presentation.destinations[0], presentation.destinations[2]] } }), InvalidTripMessageError);
});

test("an extension offer retains and validates the places already selected", () => {
  const presentation = { type: "destination_recommendations", destinations: [
    { id: "chaozhou", name: "潮州市", province: "广东省" },
  ], baseAreas: [{ province: "浙江省", places: ["松阳古村落"] }] };
  assert.deepEqual(validateTripMessage({ ...message, presentation }).presentation, presentation);
  assert.throws(() => validateTripMessage({ ...message, presentation: { ...presentation,
    baseAreas: [{ province: "浙江省", places: ["松阳古村落", "松阳古村落"] }] } }), InvalidTripMessageError);
});

test("cards stored before places were grouped read as what they were, without their image", () => {
  // The old cards named the province `region` and carried the photo shown on the card.
  const stored = { type: "destination_recommendations", destinations: [
    { id: "a", name: "香格里拉", region: "云南", reason: "适合探索", imageUrl: "https://example.test/p.jpg" },
    { id: "b", name: "阿尔山", region: null, reason: "适合徒步", imageUrl: null },
  ] };
  assert.deepEqual(validateTripMessage({ ...message, presentation: stored }).presentation, {
    type: "destination_recommendations", destinations: [
      { id: "a", name: "香格里拉", province: "云南", reason: "适合探索" },
      { id: "b", name: "阿尔山", province: null, reason: "适合徒步" },
    ] });
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

test("a card keeps an https image with its caption, and a broken stored image is left off, not fatal", () => {
  const image = { url: "https://store.is.autonavi.com/showpic/abc", caption: "玉龙雪山国家级风景名胜区" };
  const message = validateTripMessage({ id: "m-img", tripId: "t", role: "assistant", content: "看看这些", createdAt: "2026-10-03T00:00:00.000Z",
    presentation: { type: "destination_choices", mode: "add", choices: [
      { id: "a", name: "丽江市", province: "云南省", city: "丽江市", image },
      { id: "b", name: "大理白族自治州", province: "云南省", city: "大理白族自治州", image: { url: "http://x.example/a.jpg", caption: "x" } },
    ] } });
  assert.equal(message.presentation?.type, "destination_choices");
  if (message.presentation?.type !== "destination_choices") return;
  assert.deepEqual(message.presentation.choices[0].image, image);
  assert.equal("image" in message.presentation.choices[1], false);
});

test("a recommendation card keeps its landmark, and its photo is not looked up yet, found, or none", () => {
  const image = { url: "https://store.is.autonavi.com/showpic/yl", caption: "玉龙雪山" };
  const message = validateTripMessage({ id: "cards", tripId: "trip", role: "assistant", content: "看看这些地方",
    createdAt: "2026-10-04T00:00:00.000Z", presentation: { type: "destination_recommendations", destinations: [
      { id: "a", name: "丽江市", province: "云南省", landmark: "玉龙雪山" },
      { id: "b", name: "大理白族自治州", province: "云南省", image },
      { id: "c", name: "怒江傈僳族自治州", province: "云南省", image: null },
      { id: "d", name: "保山市", province: "云南省", image: { url: "http://insecure.example/x.jpg", caption: "x" } },
    ] } });
  const presentation = message.presentation as DestinationRecommendationPresentation;
  assert.deepEqual(presentation.destinations.map((item) => item.image), [undefined, image, null, null]);
  assert.equal(presentation.destinations[0].landmark, "玉龙雪山");
  assert.deepEqual(recommendationsAwaitingPhoto(presentation).map((item) => item.id), ["a"]);
  assert.throws(() => validateTripMessage({ ...message, presentation: { type: "destination_recommendations",
    destinations: [{ id: "a", name: "丽江市", province: "云南省", landmark: "x".repeat(31) }] } }));
});
