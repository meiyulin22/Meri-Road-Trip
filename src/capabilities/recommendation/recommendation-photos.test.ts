import assert from "node:assert/strict";
import test from "node:test";

import type { PlaceImage } from "@/domain/location/place-image";
import type { DestinationRecommendationPresentation } from "@/domain/trip-message/trip-message";
import type { PlacePhotoProvider, PlacePhotoQuery } from "@/platform/place-photos/place-photo-provider";

import { findRecommendationPhotos, type RecommendationPhoto } from "./recommendation-photos";

const picture = (caption: string): PlaceImage => ({ url: `https://store.is.autonavi.com/showpic/${encodeURIComponent(caption)}`, caption });

function photos(answer: (query: PlacePhotoQuery) => PlaceImage | null, asked: PlacePhotoQuery[] = []): PlacePhotoProvider {
  return { async findPhoto(query) { asked.push(query); return answer(query); } };
}

test("each card without a photo is looked up by its landmark, reported as it lands, and returned filled in", async () => {
  const presentation: DestinationRecommendationPresentation = { type: "destination_recommendations", destinations: [
    { id: "lj", name: "丽江市", province: "云南省", reason: "雪山古城", landmark: "玉龙雪山" },
    { id: "dq", name: "迪庆藏族自治州", province: "云南省", reason: "高原草甸" },
  ] };
  const asked: PlacePhotoQuery[] = [];
  const reported: RecommendationPhoto[] = [];
  const yulong = picture("玉龙雪山国家级风景名胜区");
  const result = await findRecommendationPhotos(presentation,
    photos((query) => query.kind === "named" && query.keywords === "玉龙雪山" ? yulong : null, asked),
    (photo) => reported.push(photo));
  assert.deepEqual(asked, [{ kind: "named", keywords: "玉龙雪山", region: "丽江市" },
    { kind: "scenic", region: "迪庆藏族自治州" }]);
  assert.deepEqual([...reported].sort((a, b) => a.id.localeCompare(b.id)),
    [{ id: "dq", image: null }, { id: "lj", image: yulong }]);
  assert.deepEqual(result.destinations.map((item) => item.image), [yulong, null]);
});

test("cards that already have an answer, or no province, are not looked up again", async () => {
  const kept = picture("大理古城");
  const presentation: DestinationRecommendationPresentation = { type: "destination_recommendations", destinations: [
    { id: "dl", name: "大理白族自治州", province: "云南省", image: kept },
    { id: "none", name: "怒江傈僳族自治州", province: "云南省", image: null },
    { id: "old", name: "云南", province: null },
  ] };
  const asked: PlacePhotoQuery[] = [];
  const result = await findRecommendationPhotos(presentation, photos(() => picture("x"), asked), () => undefined);
  assert.deepEqual(asked, []);
  assert.deepEqual(result, presentation);
});

test("a photo already shown in the set is not shown again under another card", async () => {
  const shared = picture("广东第一峰旅游风景区");
  const presentation: DestinationRecommendationPresentation = { type: "destination_recommendations", destinations: [
    { id: "gz", name: "广州市", province: "广东省", image: shared },
    { id: "cz", name: "潮州市", province: "广东省" },
  ] };
  const reported: RecommendationPhoto[] = [];
  const result = await findRecommendationPhotos(presentation, photos(() => shared), (photo) => reported.push(photo));
  assert.deepEqual(reported, [{ id: "cz", image: null }]);
  assert.equal(result.destinations[1].image, null);
});
