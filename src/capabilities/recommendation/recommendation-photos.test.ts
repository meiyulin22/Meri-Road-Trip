import assert from "node:assert/strict";
import test from "node:test";

import { placePhotoRulesVersion, type PlaceImage } from "@/domain/location/place-image";
import type { DestinationRecommendationPresentation } from "@/domain/trip-message/trip-message";
import { CatalogPhotoProvider } from "@/platform/place-photos/catalog-photo-provider";
import type { RemotePhotoFinder, RemotePhotoResult, RemotePhotoSubject } from "@/platform/place-photos/remote-photo-finder";
import type { PlacePhotoProvider, PlacePhotoQuery } from "@/platform/place-photos/place-photo-provider";

import { findRecommendationPhotos, withLocalRecommendationPhotos, type DeferredRecommendationPhoto, type RecommendationPhoto } from "./recommendation-photos";

const picture = (caption: string): PlaceImage => ({ url: `https://store.is.autonavi.com/showpic/${encodeURIComponent(caption)}`, caption });

function photos(answer: (query: PlacePhotoQuery) => PlaceImage | null, asked: PlacePhotoQuery[] = []): PlacePhotoProvider {
  return { async findPhoto(query) { asked.push(query); return answer(query); } };
}

test("a reopened Wanning card saved with no photo uses its new local representative without changing the saved card", async (context) => {
  const fetch = context.mock.method(globalThis, "fetch", async () => { throw new Error("Network forbidden"); });
  const saved: DestinationRecommendationPresentation = { type: "destination_recommendations", destinations: [
    { id: "wn", name: "万宁市", province: "海南省", landmark: "日月湾", image: null, photoRules: placePhotoRulesVersion },
  ] };
  const before = structuredClone(saved);
  const result = await withLocalRecommendationPhotos(saved, new CatalogPhotoProvider());
  assert.equal(result.destinations[0].image?.url, "/photos/shimei-bay-wanning-25170960.jpg");
  assert.equal(result.destinations[0].image?.caption, "石梅湾");
  assert.equal(result.destinations[0].photoRules, placePhotoRulesVersion);
  assert.deepEqual(saved, before);
  assert.equal(fetch.mock.callCount(), 0);
});

test("local read-time photos leave existing images, unlooked-up cards, missing regions and local misses unchanged", async () => {
  const existing = picture("大理古城");
  const saved: DestinationRecommendationPresentation = { type: "destination_recommendations", destinations: [
    { id: "kept", name: "大理白族自治州", province: "云南省", image: existing },
    { id: "pending", name: "万宁市", province: "海南省" },
    { id: "old", name: "云南", province: null, image: null },
    { id: "miss", name: "未收录市", province: "云南省", image: null, photoRules: placePhotoRulesVersion },
  ] };
  const asked: PlacePhotoQuery[] = [];
  const result = await withLocalRecommendationPhotos(saved, photos(() => null, asked));
  assert.equal(result, saved);
  assert.deepEqual(asked, [{ kind: "scenic", region: "未收录市" }]);
});

test("local read-time photos keep existing image priority and do not repeat a new photo within the set", async () => {
  const existing = picture("已有照片");
  const added = picture("新增照片");
  const saved: DestinationRecommendationPresentation = { type: "destination_recommendations", destinations: [
    { id: "duplicate-existing", name: "甲市", province: "云南省", image: null },
    { id: "kept", name: "乙市", province: "云南省", image: existing },
    { id: "new", name: "丙市", province: "云南省", image: null },
    { id: "duplicate-new", name: "丁市", province: "云南省", image: null },
  ] };
  const result = await withLocalRecommendationPhotos(saved,
    photos((query) => query.region === "甲市" ? existing : added));
  assert.deepEqual(result.destinations.map((item) => item.image), [null, existing, added, null]);
  assert.equal(result.destinations[0], saved.destinations[0]);
  assert.equal(result.destinations[1], saved.destinations[1]);
  assert.equal(result.destinations[3], saved.destinations[3]);
});

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

/** The usual case in these tests: one remote source. */
function oneRemote(answer: (subject: RemotePhotoSubject) => RemotePhotoResult, asked: RemotePhotoSubject[] = []):
  readonly RemotePhotoFinder[] {
  return [remote(answer, asked)];
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
    photos(() => local), () => undefined, oneRemote(() => ({ status: "none" }), asked));
  assert.deepEqual(asked, []);
});

test("a local miss is searched remotely by its landmark, with its English name when the card has one", async () => {
  const asked: RemotePhotoSubject[] = [];
  const erhai: PlaceImage = { url: "/media/place-photos/pixabay-9.jpg", caption: "洱海", credit: "Photo: a / Pixabay" };
  const reported: RecommendationPhoto[] = [];
  const result = await findRecommendationPhotos(remoteCards, photos(() => null), (photo) => reported.push(photo),
    oneRemote((subject) => subject.landmark === "洱海" ? { status: "found", image: erhai } : { status: "none" }, asked));
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
    oneRemote(() => ({ status: "unavailable", reason: "transient" })), (item) => deferred.push(item));
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
  oneRemote((subject) => subject.landmark === "大熊猫繁育研究基地" ? { status: "found", image: panda } : { status: "none" }, asked));
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
  oneRemote(() => ({ status: "none" }), asked));
  assert.deepEqual(asked, []);
  assert.equal(result.destinations[0].image, shrine);
});

test("Wikimedia is asked for both landmarks before Pixabay, and a Wikimedia photo leaves Pixabay unasked", async () => {
  const order: string[] = [];
  const temple: PlaceImage = { url: "/media/place-photos/wikimedia-7.jpg", caption: "武侯祠", credit: "Photo: a / Wikimedia Commons, CC BY-SA 4.0" };
  const wikimedia = remote((subject) => { order.push(`wikimedia:${subject.landmark}`);
    return subject.landmark === "武侯祠" ? { status: "found", image: temple } : { status: "none" }; });
  const pixabay = remote((subject) => { order.push(`pixabay:${subject.landmark}`); return { status: "none" }; });
  const result = await findRecommendationPhotos({ type: "destination_recommendations", destinations: [
    { id: "cd", name: "成都市", province: "四川省", landmark: "宽窄巷子", backupLandmarks: [{ name: "武侯祠", en: "Wuhou Shrine" }] },
  ] }, photos(() => null), () => undefined, [wikimedia, pixabay]);
  assert.deepEqual(order, ["wikimedia:宽窄巷子", "wikimedia:武侯祠"]);
  assert.equal(result.destinations[0].image, temple);
});

test("Wikimedia out of reach falls back to Pixabay, whose photo is used", async () => {
  const erhai: PlaceImage = { url: "/media/place-photos/pixabay-9.jpg", caption: "洱海", credit: "Photo: a / Pixabay" };
  const reported: RecommendationPhoto[] = [];
  const result = await findRecommendationPhotos({ ...remoteCards, destinations: [remoteCards.destinations[1]] },
    photos(() => null), (photo) => reported.push(photo),
    [remote(() => ({ status: "unavailable", reason: "transient" })), remote(() => ({ status: "found", image: erhai }))]);
  assert.deepEqual(reported, [{ id: "dl", image: erhai }]);
  assert.equal(result.destinations[0].image, erhai);
});

test("Wikimedia out of reach and nothing on Pixabay leaves the card unanswered, to be asked again later", async () => {
  const deferred: DeferredRecommendationPhoto[] = [];
  const reported: RecommendationPhoto[] = [];
  const result = await findRecommendationPhotos({ ...remoteCards, destinations: [remoteCards.destinations[1]] },
    photos(() => null), (photo) => reported.push(photo),
    [remote(() => ({ status: "unavailable", reason: "transient" })), remote(() => ({ status: "none" }))],
    (item) => deferred.push(item));
  assert.deepEqual(reported, []);
  assert.deepEqual(deferred, [{ id: "dl", reason: "transient" }]);
  assert.equal("photoRules" in result.destinations[0], false);
});
