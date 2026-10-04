import assert from "node:assert/strict";
import test from "node:test";

import { handleRecommendationPhotosPost } from "@/app/api/trips/[id]/destination-recommendation-photos/route";
import type { PlaceImage } from "@/domain/location/place-image";
import type { DestinationRecommendationPresentation, TripMessage } from "@/domain/trip-message/trip-message";
import { TripNotFoundError } from "@/domain/trip/trip-errors";
import type { PlacePhotoProvider } from "@/platform/place-photos/place-photo-provider";

const tripId = "trip-photos";
const owner = "owner-a";
const yulong: PlaceImage = { url: "https://store.is.autonavi.com/showpic/yl", caption: "玉龙雪山" };
const cardsPresentation: DestinationRecommendationPresentation = { type: "destination_recommendations", destinations: [
  { id: "lj", name: "丽江市", province: "云南省", reason: "雪山古城", landmark: "玉龙雪山" },
  { id: "dq", name: "迪庆藏族自治州", province: "云南省", reason: "高原草甸" },
] };
const cards: TripMessage = { id: "cards-1", tripId, role: "assistant", content: "我按省份列了几个地方。",
  createdAt: "2026-10-04T00:00:00.000Z", presentation: cardsPresentation };

function dependencies(messages: readonly TripMessage[], options: { photos?: PlacePhotoProvider; saveFails?: boolean } = {}) {
  const saved: DestinationRecommendationPresentation[] = [];
  return { saved, deps: {
    listMessages: async (requestedTripId: string, requestedOwner: string) => {
      if (requestedTripId !== tripId || requestedOwner !== owner) throw new TripNotFoundError(requestedTripId);
      return messages;
    },
    photos: options.photos ?? { async findPhoto(query) {
      return query.kind === "named" && query.keywords === "玉龙雪山" ? yulong : null;
    } } satisfies PlacePhotoProvider,
    savePhotos: async (input: { presentation: DestinationRecommendationPresentation }) => {
      if (options.saveFails) throw new Error("database unavailable");
      saved.push(input.presentation);
    },
  } };
}

async function lines(response: Response): Promise<unknown[]> {
  const text = await response.text();
  return text.split("\n").filter((line) => line !== "").map((line) => JSON.parse(line) as unknown);
}

test("each card's photo is streamed as one line, then the answers are saved into the card message", async () => {
  const { saved, deps } = dependencies([cards]);
  const response = await handleRecommendationPhotosPost(tripId, owner, { messageId: "cards-1" }, "r1", deps);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("Content-Type") ?? "", /application\/x-ndjson/u);
  assert.equal(response.headers.get("X-Accel-Buffering"), "no");
  const received = await lines(response);
  assert.equal(received.length, 2);
  assert.deepEqual(received.find((line) => (line as { id: string }).id === "lj"), { id: "lj", image: yulong });
  assert.deepEqual(received.find((line) => (line as { id: string }).id === "dq"), { id: "dq", image: null });
  assert.deepEqual(saved, [{ ...cardsPresentation, destinations: [
    { ...cardsPresentation.destinations[0], image: yulong }, { ...cardsPresentation.destinations[1], image: null }] }]);
});

test("cards that all have their answer get an empty stream and nothing is saved", async () => {
  const answered: TripMessage = { ...cards, presentation: { ...cardsPresentation, destinations: cardsPresentation.destinations
    .map((item) => ({ ...item, image: null })) } };
  const { saved, deps } = dependencies([answered], { photos: { async findPhoto() { throw new Error("must not look up"); } } });
  const response = await handleRecommendationPhotosPost(tripId, owner, { messageId: "cards-1" }, "r2", deps);
  assert.equal(response.status, 200);
  assert.deepEqual(await lines(response), []);
  assert.deepEqual(saved, []);
});

test("a failed save still ends the stream with every photo sent", async () => {
  const { deps } = dependencies([cards], { saveFails: true });
  const response = await handleRecommendationPhotosPost(tripId, owner, { messageId: "cards-1" }, "r3", deps);
  assert.equal((await lines(response)).length, 2);
});

test("the photos are still saved when the browser leaves before they are all found", async () => {
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => { release = resolve; });
  const { saved, deps } = dependencies([cards], { photos: { async findPhoto() { await held; return null; } } });
  const response = await handleRecommendationPhotosPost(tripId, owner, { messageId: "cards-1" }, "r4", deps);
  await response.body?.cancel();
  release();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(saved.length, 1);
});

test("someone else's Journey, a message without cards and a malformed body are refused", async () => {
  const reply: TripMessage = { id: "reply-1", tripId, role: "assistant", content: "好的。", createdAt: "2026-10-04T00:00:01.000Z" };
  const { deps } = dependencies([cards, reply]);
  assert.equal((await handleRecommendationPhotosPost(tripId, "owner-b", { messageId: "cards-1" }, "r5", deps)).status, 404);
  assert.equal((await handleRecommendationPhotosPost(tripId, null, { messageId: "cards-1" }, "r5", deps)).status, 404);
  assert.equal((await handleRecommendationPhotosPost(tripId, owner, { messageId: "reply-1" }, "r5", deps)).status, 404);
  assert.equal((await handleRecommendationPhotosPost(tripId, owner, { messageId: "cards-1", extra: true }, "r5", deps)).status, 400);
  assert.equal((await handleRecommendationPhotosPost(tripId, owner, [], "r5", deps)).status, 400);
});
