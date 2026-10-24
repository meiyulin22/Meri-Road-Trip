import assert from "node:assert/strict";
import test from "node:test";

import { placePhotoRulesVersion, type PlaceImage } from "@/domain/location/place-image";
import type { DestinationRecommendationPresentation } from "@/domain/trip-message/trip-message";
import type { RemotePhotoFinder, RemotePhotoResult, RemotePhotoSubject } from "@/platform/place-photos/pixabay-photo-finder";
import type { PlacePhotoProvider, PlacePhotoQuery } from "@/platform/place-photos/place-photo-provider";

import { findRecommendationPhotos, type DeferredRecommendationPhoto, type RecommendationPhoto } from "./recommendation-photos";

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

function remote(answer: (subject: RemotePhotoSubject) => RemotePhotoResult, asked: RemotePhotoSubject[] = []): RemotePhotoFinder {
  return {
    startBatch: () => ({ searchesLeft: 8, downloadsLeft: 4, deadline: Number.MAX_SAFE_INTEGER, stopped: null }),
    async find(subject) { asked.push(subject); return answer(subject); },
  };
}

const remoteCards: DestinationRecommendationPresentation = { type: "destination_recommendations", destinations: [
  { id: "lj", name: "丽江市", province: "云南省", landmark: "玉龙雪山", landmarkEn: "Jade Dragon Snow Mountain" },
  { id: "dl", name: "大理白族自治州", province: "云南省", landmark: "洱海", landmarkEn: "Erhai Lake" },
  { id: "old", name: "怒江傈僳族自治州", province: "云南省", landmark: "丙中洛" },
] };

test("a card the local photos have is never searched for remotely", async () => {
  const asked: RemotePhotoSubject[] = [];
  const local = picture("玉龙雪山");
  await findRecommendationPhotos({ ...remoteCards, destinations: [remoteCards.destinations[0]] },
    photos(() => local), () => undefined, remote(() => ({ status: "none" }), asked));
  assert.deepEqual(asked, []);
});

test("a local miss is searched remotely by its landmark, with its English name when the card has one", async () => {
  const asked: RemotePhotoSubject[] = [];
  const erhai: PlaceImage = { url: "/media/place-photos/pixabay-9.jpg", caption: "洱海", credit: "Photo: a / Pixabay" };
  const reported: RecommendationPhoto[] = [];
  const result = await findRecommendationPhotos(remoteCards, photos(() => null), (photo) => reported.push(photo),
    remote((subject) => subject.landmark === "洱海" ? { status: "found", image: erhai } : { status: "none" }, asked));
  assert.deepEqual(asked.map((subject) => subject.landmark).sort(), ["丙中洛", "洱海", "玉龙雪山"]);
  assert.deepEqual(asked.find((subject) => subject.landmark === "洱海"),
    { province: "云南省", region: "大理白族自治州", landmark: "洱海", english: "Erhai Lake", aliases: undefined });
  assert.equal(asked.find((subject) => subject.landmark === "丙中洛")?.english, undefined);
  assert.deepEqual(result.destinations.map((item) => item.image), [null, erhai, null]);
  assert.deepEqual(result.destinations.map((item) => item.photoRules), [placePhotoRulesVersion, placePhotoRulesVersion, placePhotoRulesVersion]);
  assert.equal(reported.length, 3);
});

test("a remote lookup that could not run leaves its card unanswered, not saved as having no photo", async () => {
  const reported: RecommendationPhoto[] = [];
  const deferred: DeferredRecommendationPhoto[] = [];
  const result = await findRecommendationPhotos(remoteCards, photos(() => null), (photo) => reported.push(photo),
    remote(() => ({ status: "unavailable", reason: "transient" })), (item) => deferred.push(item));
  assert.deepEqual(reported, []);
  assert.deepEqual(deferred.map((item) => item.id).sort(), ["dl", "lj", "old"]);
  assert.equal("image" in result.destinations[0], false);
  assert.equal("photoRules" in result.destinations[0], false);
  assert.equal("image" in result.destinations[2], false);
});

test("when a city card's own landmark has no photo, its first stand-in is tried, under its own name", async () => {
  const asked: RemotePhotoSubject[] = [];
  const panda: PlaceImage = { url: "/media/place-photos/pixabay-3.jpg", caption: "大熊猫繁育研究基地", credit: "Photo: a / Pixabay" };
  const result = await findRecommendationPhotos({ type: "destination_recommendations", destinations: [
    { id: "cd", name: "成都市", province: "四川省", landmark: "宽窄巷子", landmarkEn: "Wide and Narrow Alleys",
      landmarkAliases: ["Kuanzhai Alley"], backupLandmarks: [
        { name: "大熊猫繁育研究基地", en: "Chengdu Research Base of Giant Panda Breeding" }, { name: "武侯祠", en: "Wuhou Shrine" }] },
  ] }, photos(() => null), () => undefined,
  remote((subject) => subject.landmark === "大熊猫繁育研究基地" ? { status: "found", image: panda } : { status: "none" }, asked));
  assert.deepEqual(asked.map((subject) => subject.landmark), ["宽窄巷子", "大熊猫繁育研究基地"]);
  assert.deepEqual(asked[0].aliases, ["Kuanzhai Alley"]);
  assert.equal(result.destinations[0].image, panda);
});

test("a stand-in already in the local photos is used before anything is searched", async () => {
  const asked: RemotePhotoSubject[] = [];
  const shrine = picture("武侯祠");
  const result = await findRecommendationPhotos({ type: "destination_recommendations", destinations: [
    { id: "cd", name: "成都市", province: "四川省", landmark: "宽窄巷子", backupLandmarks: [{ name: "武侯祠", en: "Wuhou Shrine" }] },
  ] }, photos((query) => query.kind === "named" && query.keywords === "武侯祠" ? shrine : null), () => undefined,
  remote(() => ({ status: "none" }), asked));
  assert.deepEqual(asked, []);
  assert.equal(result.destinations[0].image, shrine);
});
