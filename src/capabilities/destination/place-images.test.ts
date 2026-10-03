import assert from "node:assert/strict";
import test from "node:test";

import type { PlaceImage } from "@/domain/location/place-image";
import type { PlacePhotoProvider, PlacePhotoQuery } from "@/platform/place-photos/place-photo-provider";
import { findPlaceImage, imagesShownInConversation, photoQueriesFor, selectedPlaceImages, withChoiceImages } from "./place-images";

function photos(answers: (query: PlacePhotoQuery) => PlaceImage | null, seen: PlacePhotoQuery[] = []): PlacePhotoProvider {
  return { async findPhoto(query) { seen.push(query); return answers(query); } };
}
const picture = (caption: string): PlaceImage => ({ url: `https://store.is.autonavi.com/showpic/${encodeURIComponent(caption)}`, caption });

test("lookups run from the most specific to the province, and an administrative spot is searched inside", () => {
  assert.deepEqual(photoQueriesFor({ province: "云南省", place: "迪庆藏族自治州", spot: "梅里雪山", landmark: "普达措" }), [
    { kind: "named", keywords: "梅里雪山", region: "迪庆藏族自治州" },
    { kind: "scenic", region: "迪庆藏族自治州" }, { kind: "scenic", region: "云南省" }]);
  assert.deepEqual(photoQueriesFor({ province: "云南省", place: "迪庆藏族自治州", spot: "香格里拉市" })[0],
    { kind: "scenic", region: "香格里拉市" });
  assert.deepEqual(photoQueriesFor({ province: "云南省", place: "丽江市", spot: null, landmark: "玉龙雪山" })[0],
    { kind: "named", keywords: "玉龙雪山", region: "丽江市" });
  assert.deepEqual(photoQueriesFor({ province: "云南省", place: "丽江市", spot: null }),
    [{ kind: "scenic", region: "丽江市" }, { kind: "scenic", region: "云南省" }]);
  assert.deepEqual(photoQueriesFor({ province: "云南省", place: null, spot: null }), [{ kind: "scenic", region: "云南省" }]);
});

test("each lookup is tried in turn until one has a photo", async () => {
  const seen: PlacePhotoQuery[] = [];
  const image = await findPlaceImage({ province: "辽宁省", place: "朝阳市", spot: "朝阳县" },
    photos((query) => query.kind === "scenic" && query.region === "朝阳市" ? picture("凤凰山") : null, seen));
  assert.deepEqual(image, picture("凤凰山"));
  assert.deepEqual(seen, [{ kind: "scenic", region: "朝阳县" }, { kind: "scenic", region: "朝阳市" }]);
});

test("offered places gain photos where found and stay as they were otherwise", async () => {
  const result = await withChoiceImages({ type: "destination_choices", mode: "add", choices: [
    { id: "a", name: "迪庆藏族自治州", province: "云南省", city: "迪庆藏族自治州", spot: "梅里雪山" },
    { id: "b", name: "潮州市", province: "广东省", city: "潮州市" },
  ] }, photos((query) => query.kind === "named" ? picture(query.keywords) : null));
  assert.deepEqual(result.choices[0].image, picture("梅里雪山"));
  assert.equal("image" in result.choices[1], false);
});

test("selected places map to one photo each, a province-only area included, in destination order", async () => {
  const result = await selectedPlaceImages([
    { province: "云南省", places: [{ name: "丽江市", spots: ["玉龙雪山"] }, { name: "大理白族自治州", spots: [] }] },
    { province: "海南省", places: [] },
  ], photos((query) => query.kind === "named" ? picture(query.keywords)
    : query.region === "海南省" ? picture("海南省景区") : null));
  assert.deepEqual(result, [
    { key: "云南省/丽江市", label: "丽江市", image: picture("玉龙雪山") },
    { key: "海南省", label: "海南省", image: picture("海南省景区") },
  ]);
});

test("a place picked from a card keeps the photo that card showed instead of a fresh lookup", async () => {
  const shown = imagesShownInConversation([
    { id: "r", tripId: "t", role: "assistant", content: "看看", createdAt: "2026-10-03T00:00:00.000Z",
      presentation: { type: "destination_recommendations", destinations: [
        { id: "a", name: "丽江市", province: "云南省", image: picture("玉龙雪山国家级风景名胜区") }] } },
    { id: "c", tripId: "t", role: "assistant", content: "找到了", createdAt: "2026-10-03T00:00:01.000Z",
      presentation: { type: "destination_choices", mode: "add", choices: [
        { id: "m", name: "迪庆藏族自治州", province: "云南省", city: "迪庆藏族自治州", spot: "梅里雪山", image: picture("梅里雪山") }] } },
  ]);
  const seen: PlacePhotoQuery[] = [];
  const result = await selectedPlaceImages([{ province: "云南省", places: [
    { name: "丽江市", spots: [] }, { name: "迪庆藏族自治州", spots: ["梅里雪山"] }, { name: "大理白族自治州", spots: [] }] }],
  photos(() => picture("大理古城"), seen), shown);
  assert.deepEqual(result.map((item) => item.image.caption), ["玉龙雪山国家级风景名胜区", "梅里雪山", "大理古城"]);
  assert.equal(seen.length, 1);
});
