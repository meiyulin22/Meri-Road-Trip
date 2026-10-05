import assert from "node:assert/strict";
import test from "node:test";

import type { PlaceImage } from "@/domain/location/place-image";
import type { TripMessage } from "@/domain/trip-message/trip-message";
import type { JourneySummary } from "@/platform/persistence/journey-summary-repository";
import type { PlacePhotoProvider, PlacePhotoQuery } from "@/platform/place-photos/place-photo-provider";

import { journeyCovers } from "./journey-covers";

const picture = (caption: string): PlaceImage => ({ url: `https://store.is.autonavi.com/showpic/${encodeURIComponent(caption)}`, caption });

function journey(id: string, areas: JourneySummary["destinationAreas"]): JourneySummary {
  return { id, name: id, destination: null, destinationAreas: areas, startDate: null, endDate: null,
    status: "idea", updatedAt: "2026-10-05T00:00:00.000Z" };
}

function photos(answer: (query: PlacePhotoQuery) => Promise<PlaceImage | null>, seen: PlacePhotoQuery[] = []): PlacePhotoProvider {
  return { findPhoto(query) { seen.push(query); return answer(query); } };
}

const lijiang = [{ province: "云南省", places: [{ name: "丽江市", spots: [] }] }];

test("a Journey's cover is its first place's photo; a Journey with no place has none and costs no lookup", async () => {
  const seen: PlacePhotoQuery[] = [];
  const covers = await journeyCovers([journey("a", lijiang), journey("b", [])], {
    listMessages: async () => [],
    photos: photos(async (query) => picture(query.kind === "scenic" ? query.region : query.keywords), seen),
    waitMs: 1_000,
  });
  assert.deepEqual(covers, { a: picture("丽江市") });
  assert.equal(seen.length, 1);
});

test("a place picked from a card keeps the card's photo, as in the Workspace", async () => {
  const card: TripMessage = { id: "r", tripId: "a", role: "assistant", content: "看看", createdAt: "2026-10-03T00:00:00.000Z",
    presentation: { type: "destination_recommendations", destinations: [
      { id: "x", name: "丽江市", province: "云南省", image: picture("玉龙雪山国家级风景名胜区") }] } };
  const covers = await journeyCovers([journey("a", lijiang)], {
    listMessages: async () => [card],
    photos: photos(async () => picture("玉水寨")),
    waitMs: 1_000,
  });
  assert.equal(covers.a.caption, "玉龙雪山国家级风景名胜区");
});

test("a slow or failed lookup leaves only that card without a photo", async () => {
  const covers = await journeyCovers([
    journey("fast", lijiang),
    journey("slow", [{ province: "海南省", places: [] }]),
    journey("broken", [{ province: "四川省", places: [] }]),
  ], {
    listMessages: async (tripId) => {
      if (tripId === "broken") throw new Error("database down");
      return [];
    },
    photos: photos((query) => query.kind === "scenic" && query.region === "海南省"
      ? new Promise((resolve) => setTimeout(() => resolve(picture("海南")), 200))
      : Promise.resolve(picture("丽江"))),
    waitMs: 20,
  });
  assert.deepEqual(Object.keys(covers), ["fast"]);
});
