import assert from "node:assert/strict";
import test from "node:test";

import { judgeHit, rankHits, searchVariants, type RemotePhotoSubject } from "./pixabay-photo-match";
import { hit } from "./pixabay-test-fixtures";

const yulong: RemotePhotoSubject = { province: "云南省", region: "丽江市", landmark: "玉龙雪山", english: "Jade Dragon Snow Mountain" };
const cangshan: RemotePhotoSubject = { province: "云南省", region: "大理白族自治州", landmark: "苍山", english: "Cangshan Mountain" };

test("a hit names the landmark only through every distinctive word, never through 'mountain' or 'Yunnan'", () => {
  assert.deepEqual(judgeHit(hit(1, "jade dragon snow mountain, lijiang, yunnan"), yulong),
    { accepted: true, matched: ["jade", "dragon"], regional: true });
  assert.deepEqual(judgeHit(hit(2, "dragon, mountain, snow, yunnan, china"), yulong), { accepted: false, reason: "no_identity" });
  assert.deepEqual(judgeHit(hit(3, "mountain, snow, lake, yunnan"), cangshan), { accepted: false, reason: "no_identity" });
});

test("the page slug counts as the uploader's words too", () => {
  const fromSlug = hit(4, "landscape, nature", { pageURL: "https://pixabay.com/photos/dali-cangshan-erhai-lake-1804795/" });
  assert.equal(judgeHit(fromSlug, cangshan).accepted, true);
});

test("a hit naming another prefecture, province or country is rejected however well the name matches", () => {
  assert.deepEqual(judgeHit(hit(5, "cangshan, lijiang, mountain"), cangshan), { accepted: false, reason: "other_region" });
  assert.deepEqual(judgeHit(hit(6, "cangshan, sichuan"), cangshan), { accepted: false, reason: "other_province" });
  assert.deepEqual(judgeHit(hit(7, "jade dragon, japan, mountain"), yulong), { accepted: false, reason: "foreign" });
});

test("a sight between two prefectures may name both, as long as its own is one of them", () => {
  const gorge: RemotePhotoSubject = { province: "云南省", region: "迪庆藏族自治州", landmark: "虎跳峡", english: "Tiger Leaping Gorge" };
  assert.equal(judgeHit(hit(8, "tiger leaping gorge, lijiang, shangri la, yunnan"), gorge).accepted, true);
  assert.deepEqual(judgeHit(hit(9, "tiger leaping gorge, lijiang"), gorge), { accepted: false, reason: "other_region" });
});

test("a name made only of kinds and a region's own name needs every word and the region", () => {
  const westLake: RemotePhotoSubject = { province: "浙江省", region: "杭州市", landmark: "西湖", english: "West Lake" };
  assert.equal(judgeHit(hit(10, "west lake, hangzhou, china"), westLake).accepted, true);
  assert.deepEqual(judgeHit(hit(11, "west lake, sunset"), westLake), { accepted: false, reason: "no_identity" });
  const oldTown: RemotePhotoSubject = { province: "云南省", region: "大理白族自治州", landmark: "大理古城", english: "Dali Ancient City" };
  assert.deepEqual(judgeHit(hit(12, "dali, erhai, lake"), oldTown), { accepted: false, reason: "no_identity" });
  // A county's own name mostly means the sight it is known for.
  const pingyao: RemotePhotoSubject = { province: "山西省", region: "晋中市", landmark: "平遥古城", english: "Pingyao Ancient City" };
  assert.equal(judgeHit(hit(13, "pingyao, shanxi, roofs"), pingyao).accepted, true);
});

test("a photo too small for a card, or upright, is not a candidate", () => {
  assert.deepEqual(judgeHit(hit(14, "jade dragon snow mountain", { imageWidth: 640 }), yulong), { accepted: false, reason: "too_small" });
  assert.deepEqual(judgeHit(hit(15, "jade dragon snow mountain", { imageWidth: 2000, imageHeight: 3000 }), yulong),
    { accepted: false, reason: "too_small" });
});

test("hits that also name the region come first, then Pixabay's own order", () => {
  const ranked = rankHits([hit(20, "jade dragon, snow, china"), hit(21, "mountain"), hit(22, "jade dragon, lijiang")], yulong);
  assert.deepEqual(ranked.map((item) => item.hit.id), [22, 20]);
});

test("the search asks for the English name, then once more with the region", () => {
  assert.deepEqual(searchVariants(yulong), ["Jade Dragon Snow Mountain", "Jade Dragon Snow Mountain lijiang"]);
  assert.deepEqual(searchVariants({ ...cangshan, english: "Cangshan Dali" }), ["Cangshan Dali"]);
});

test("a hit that never says it is in China is not a photo of a Chinese landmark", () => {
  const stoneForest: RemotePhotoSubject = { province: "云南省", region: "昆明市", landmark: "石林", english: "Stone Forest" };
  // Pixabay 4074026, the first real answer to "Stone Forest" that passed the old rule.
  const meteora = hit(4074026, "meteora, monastery, landscape, mountain, rock, stone, stones", {
    pageURL: "https://pixabay.com/photos/meteora-greece-monastery-landscape-4074026/" });
  assert.equal(judgeHit(meteora, stoneForest).accepted, false);
  assert.deepEqual(judgeHit(hit(1, "stone, rocks, landscape"), stoneForest), { accepted: false, reason: "not_in_china" });
  assert.equal(judgeHit(hit(694640, "china, kunming, stone forest, stones"), stoneForest).accepted, true);
  assert.equal(judgeHit(hit(2, "stone forest, china, rocks"), stoneForest).accepted, true);
});
