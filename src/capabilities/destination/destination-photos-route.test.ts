import assert from "node:assert/strict";
import test from "node:test";

import type { TripState } from "@/domain/trip-state/trip-state";
import { TripNotFoundError } from "@/domain/trip/trip-errors";
import { handleDestinationPhotosGet } from "@/app/api/trips/[id]/destination-photos/route";

const state: TripState = {
  name: { state: "missing" }, origin: { state: "missing" },
  destination: { state: "known", source: "user", areas: [{ province: "云南省", places: [{ name: "丽江市", spots: ["玉龙雪山"] }] }] },
  startDate: { state: "missing" }, endDate: { state: "missing" }, duration: { state: "missing" }, transportPreference: { state: "missing" },
};
const image = { url: "https://store.is.autonavi.com/showpic/yl", caption: "玉龙雪山国家级风景名胜区" };

test("photos follow the Journey's current places and are never cached as shared", async () => {
  const response = await handleDestinationPhotosGet("t", "owner", {
    loadJourney: async () => ({ tripState: state }), listMessages: async () => [], photos: { async findPhoto() { return image; } } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.deepEqual(await response.json(), { photos: [{ key: "云南省/丽江市", label: "丽江市", image }] });
});

test("a missing owner or Journey is not found, and other failures are not mistaken for it", async () => {
  const photos = { async findPhoto() { return null; } };
  assert.equal((await handleDestinationPhotosGet("t", null, { loadJourney: async () => ({ tripState: state }), listMessages: async () => [], photos })).status, 404);
  assert.equal((await handleDestinationPhotosGet("t", "o", { loadJourney: async () => { throw new TripNotFoundError("t"); }, listMessages: async () => [], photos })).status, 404);
  assert.equal((await handleDestinationPhotosGet("t", "o", { loadJourney: async () => { throw new Error("db down"); }, listMessages: async () => [], photos })).status, 500);
});
