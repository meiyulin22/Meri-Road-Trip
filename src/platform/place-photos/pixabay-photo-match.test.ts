import assert from "node:assert/strict";
import test from "node:test";

import { assessHits, judgeHit, rankHits, searchVariants, type RemotePhotoSubject } from "./pixabay-photo-match";
import { regionShortName } from "./photo-regions";
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

test("the search asks in English, then in Chinese, then by another name or with the region — three at most", () => {
  assert.deepEqual(searchVariants(yulong), [{ q: "Jade Dragon Snow Mountain", lang: "en" }, { q: "玉龙雪山", lang: "zh" },
    { q: "Jade Dragon Snow Mountain lijiang", lang: "en" }]);
  assert.deepEqual(searchVariants({ ...cangshan, english: "Cangshan Dali" }), [{ q: "Cangshan Dali", lang: "en" }, { q: "苍山", lang: "zh" }]);
  const alleys: RemotePhotoSubject = { province: "四川省", region: "成都市", landmark: "宽窄巷子", english: "Wide and Narrow Alleys",
    aliases: ["Kuanzhai Alley", "宽窄巷"] };
  assert.deepEqual(searchVariants(alleys), [{ q: "Wide and Narrow Alleys", lang: "en" }, { q: "宽窄巷子", lang: "zh" },
    { q: "Kuanzhai Alley", lang: "en" }]);
  // An older card has only its Chinese landmark.
  assert.deepEqual(searchVariants({ province: "云南省", region: "怒江傈僳族自治州", landmark: "丙中洛" }), [{ q: "丙中洛", lang: "zh" }]);
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

test("a Chinese name is found in Chinese tags, even split over two of them", () => {
  const alleys: RemotePhotoSubject = { province: "四川省", region: "成都市", landmark: "宽窄巷子", english: "Wide and Narrow Alleys" };
  // Pixabay 2680194 as lang=zh returns it, and as lang=en (a machine translation that names neither).
  const chinese = hit(2680194, "成都, 宽窄, 巷子, 明信片, 成都", { pageURL: "https://pixabay.com/photos/chengdu-width-alley-postcard-2680194/" });
  const english = hit(2680194, "chengdu, width, alley, postcard, chengdu", { pageURL: chinese.pageURL });
  assert.deepEqual(judgeHit(chinese, alleys), { accepted: true, matched: ["宽窄巷子"], regional: true });
  assert.deepEqual(judgeHit(english, alleys), { accepted: false, reason: "no_identity" });
});

test("any of the landmark's names identifies it, plurals folded", () => {
  const alleys: RemotePhotoSubject = { province: "四川省", region: "成都市", landmark: "宽窄巷子", english: "Wide and Narrow Alleys",
    aliases: ["Kuanzhai Alley"] };
  assert.equal(judgeHit(hit(1, "kuanzhai alleys, chengdu, china"), alleys).accepted, true);
  // Through an alias the region must be named too: Kimi offered 热带植物园 for 西双版纳's botanical garden.
  assert.deepEqual(judgeHit(hit(4, "kuanzhai alley, china"), alleys), { accepted: false, reason: "no_identity" });
  const garden: RemotePhotoSubject = { province: "云南省", region: "西双版纳傣族自治州", landmark: "中科院西双版纳热带植物园",
    english: "Xishuangbanna Tropical Botanical Garden", aliases: ["热带植物园"] };
  assert.deepEqual(judgeHit(hit(5, "热带植物园, 中国, 棕榈"), garden), { accepted: false, reason: "no_identity" });
  assert.equal(judgeHit(hit(6, "热带植物园, 西双版纳, 棕榈"), garden).accepted, true);
  assert.equal(judgeHit(hit(2, "wide and narrow alley, chengdu"), alleys).accepted, true);
  assert.deepEqual(judgeHit(hit(3, "alley, street, chengdu"), alleys), { accepted: false, reason: "no_identity" });
});

test("Chinese tags count against a hit too: another region, a foreign place, and 中国 as the only China evidence", () => {
  const erhai: RemotePhotoSubject = { province: "云南省", region: "大理白族自治州", landmark: "洱海", english: "Erhai Lake" };
  assert.deepEqual(judgeHit(hit(1, "洱海, 丽江, 湖"), erhai), { accepted: false, reason: "other_region" });
  assert.deepEqual(judgeHit(hit(2, "洱海, 日本, 湖"), erhai), { accepted: false, reason: "foreign" });
  assert.deepEqual(judgeHit(hit(3, "洱海, 四川"), erhai), { accepted: false, reason: "other_province" });
  assert.equal(judgeHit(hit(4, "洱海, 湖, 中国"), erhai).accepted, true);
  assert.equal(judgeHit(hit(5, "洱海, 大理, 苍山"), erhai).accepted, true);
  assert.deepEqual(judgeHit(hit(6, "洱海, 湖"), erhai), { accepted: false, reason: "not_in_china" });
});

test("rejections are counted by reason for the log and the misses list", () => {
  const assessment = assessHits([hit(1, "mountain"), hit(2, "jade dragon, japan"), hit(3, "jade dragon, lijiang"),
    hit(4, "jade dragon, china", { imageWidth: 500 })], yulong);
  assert.deepEqual(assessment.accepted.map((item) => item.hit.id), [3]);
  assert.deepEqual(assessment.rejected, { no_identity: 1, foreign: 1, too_small: 1 });
});

test("a region's short Chinese name drops its level and the peoples in its name", () => {
  assert.deepEqual(["大理白族自治州", "红河哈尼族彝族自治州", "海西蒙古族藏族自治州", "新疆维吾尔自治区", "广西壮族自治区",
    "内蒙古自治区", "丽江市", "香港特别行政区", "阿里地区", "西双版纳傣族自治州"].map(regionShortName),
  ["大理", "红河", "海西", "新疆", "广西", "内蒙古", "丽江", "香港", "阿里", "西双版纳"]);
});

test("regions are read tag by tag: 玄武湖, 南京 does not name 湖南", () => {
  // Codex's synthetic case from the 1.0625 acceptance run.
  const xuanwu: RemotePhotoSubject = { province: "江苏省", region: "南京市", landmark: "玄武湖", english: "Xuanwu Lake" };
  assert.deepEqual(judgeHit(hit(1, "玄武湖, 南京, 湖"), xuanwu), { accepted: true, matched: ["玄武湖"], regional: true });
  assert.deepEqual(judgeHit(hit(2, "玄武湖, 湖南"), xuanwu), { accepted: false, reason: "other_province" });
  // The landmark's own name may still run across tags.
  assert.equal(judgeHit(hit(3, "玄武, 湖, 南京"), xuanwu).accepted, true);
});

test("an alias that only names a region does not identify the landmark", () => {
  // Codex's synthetic case: an alias "四川" let 四川, 中国, 火锅 pass.
  const leshan: RemotePhotoSubject = { province: "四川省", region: "乐山市", landmark: "乐山大佛", english: "Leshan Giant Buddha",
    aliases: ["四川", "乐山", "Sichuan", "Leshan China", "大佛"] };
  assert.deepEqual(judgeHit(hit(1, "四川, 中国, 火锅"), leshan), { accepted: false, reason: "no_identity" });
  assert.deepEqual(judgeHit(hit(2, "sichuan, china, hotpot"), leshan), { accepted: false, reason: "no_identity" });
  assert.deepEqual(judgeHit(hit(3, "leshan, china, river"), leshan), { accepted: false, reason: "no_identity" });
  // A real alias still works, with the region named.
  assert.equal(judgeHit(hit(4, "大佛, 乐山, 中国"), leshan).accepted, true);
  // The landmark's own name may be a region's: 黄山 is the city and the mountain.
  const huangshan: RemotePhotoSubject = { province: "安徽省", region: "黄山市", landmark: "黄山", english: "Huangshan" };
  assert.equal(judgeHit(hit(5, "黄山, 安徽, 云海"), huangshan).accepted, true);
});

test("广安里 in Busan is not 广安市: the shared name is ruled out by the foreign place beside it", () => {
  // The catalog's 广安 candidates were all of Busan's Gwangalli bridge (2026-10-24).
  const guangan: RemotePhotoSubject = { province: "四川省", region: "广安市", landmark: "广安" };
  assert.deepEqual(judgeHit(hit(9202902, "节日, 烟花, 釜山, 广安桥, 夜景, 城市"), guangan), { accepted: false, reason: "foreign" });
  assert.deepEqual(judgeHit(hit(2078844, "广安桥, 广安里海滩, 广安里近海"), guangan), { accepted: false, reason: "foreign" });
});
