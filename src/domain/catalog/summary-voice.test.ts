import assert from "node:assert/strict";
import test from "node:test";

import { adminStem, checkVoiceRewrite, numbersIn, placeNameVocabulary, sharedRun, type VoiceRewrite } from "./summary-voice";

const vocabulary = placeNameVocabulary([
  { name: "庐山", aliases: ["匡庐"], location: { province: "江西省", prefecture: "九江市", county: null } },
  { name: "三叠泉", aliases: [], location: { province: "江西省", prefecture: "九江市", county: "庐山市" } },
  { name: "崇圣寺三塔", aliases: ["三塔"], location: { province: "云南省", prefecture: "大理白族自治州", county: "大理市" } },
]);

const input = (rewrite: string, overrides: Partial<VoiceRewrite> = {}): VoiceRewrite => ({
  original: "庐山一处沿多级崖壁落下的瀑布，攻略提示峡谷步行有上下坡和石阶。",
  rewrite,
  reportedPlaces: ["庐山"],
  sourcePages: ["三叠泉位于庐山东南的九叠谷，游人沿石阶下行约一小时可到潭边"],
  vocabulary,
  ...overrides,
});

test("a rewrite that keeps the facts in new words passes", () => {
  assert.deepEqual(checkVoiceRewrite(input("庐山的多级崖壁瀑布，走峡谷要上下坡，也有不少石阶。")), []);
});

test("「攻略」, length and contact details are refused", () => {
  assert.ok(checkVoiceRewrite(input("庐山的瀑布，攻略说要走石阶。")).includes("mentions_guide"));
  assert.ok(checkVoiceRewrite(input("庐山的瀑布，书中说要走石阶。")).includes("mentions_guide"));
  assert.ok(checkVoiceRewrite(input(`庐山${"瀑".repeat(100)}`)).some((problem) => problem.startsWith("too_long")));
  assert.ok(checkVoiceRewrite(input("庐山的瀑布，详情见微信。")).includes("contact_details"));
  assert.deepEqual(checkVoiceRewrite(input("   ")), ["empty"]);
});

test("eight Han characters shared with the guide's page are copying; seven are not", () => {
  assert.equal(sharedRun("沿石阶下行约一小时", ["游人沿石阶下行约一小时可到"]), "沿石阶下行约一小");
  assert.equal(sharedRun("沿石阶下行约一", ["游人沿石阶下行约一小时可到"]), null);
  // Punctuation and Latin letters do not break a run: only Han characters are compared.
  assert.equal(sharedRun("沿石阶，下行 约一小时", ["游人沿石阶下行约一小时可到"]), "沿石阶下行约一小");
  const problems = checkVoiceRewrite(input("庐山的瀑布，游人沿石阶下行约一小时，有上下坡。"));
  assert.ok(problems.some((problem) => problem.startsWith("copies_source")));
});

test("numbers must stay the same; a lone 一 is a word, not a count", () => {
  assert.deepEqual(numbersIn("海拔3200米，有两条步道和十二座桥，一带"), ["3200", "十二", "两"].sort());
  const original = "庐山海拔1474米的山峰，攻略列出两条步道。";
  assert.deepEqual(checkVoiceRewrite(input("庐山的山峰，海拔1474米，有两条步道。", { original })), []);
  assert.ok(checkVoiceRewrite(input("庐山的山峰，海拔1500米，有两条步道。", { original }))
    .some((problem) => problem.startsWith("numbers_changed")));
  assert.ok(checkVoiceRewrite(input("庐山的山峰，海拔1474米，有步道。", { original }))
    .some((problem) => problem.startsWith("numbers_changed")));
  assert.deepEqual(checkVoiceRewrite(input("庐山沿多级崖壁落下的瀑布，峡谷步行有上下坡和石阶。")), []);
  // How many guides said it is not a fact about the place.
  assert.deepEqual(checkVoiceRewrite(input("庐山的瀑布，有石阶。", { original: "庐山的瀑布，两份攻略都提到石阶。" })), []);
});

test("place names the catalog knows must be neither dropped nor added", () => {
  const dropped = checkVoiceRewrite(input("多级崖壁上的瀑布，峡谷步行有上下坡和石阶。"));
  assert.ok(dropped.includes("places_missing: 庐山"));
  const added = checkVoiceRewrite(input("庐山三叠泉，多级崖壁上的瀑布，峡谷步行有上下坡和石阶。"));
  assert.ok(added.includes("places_added: 三叠泉"));
});

test("places the model reports in the original must be kept in the rewrite", () => {
  const original = "九江庐山攻略介绍的牯岭镇，适合住宿和出发游览。";
  assert.deepEqual(checkVoiceRewrite(input("九江庐山上的牯岭镇，适合住下，也方便出发游览。", { original, reportedPlaces: ["九江", "庐山", "牯岭镇"] })), []);
  assert.ok(checkVoiceRewrite(input("九江庐山上的镇子，适合住下，也方便出发游览。", { original, reportedPlaces: ["牯岭镇"] }))
    .includes("places_missing: 牯岭镇"));
  // The model also lists the entry's own name and city; names not in the original are not its to check.
  assert.deepEqual(checkVoiceRewrite(input("九江庐山上的牯岭镇，适合住下，也方便出发游览。", { original, reportedPlaces: ["牯岭镇", "九江市"] })), []);
});

test("the vocabulary holds names, aliases and short administrative names", () => {
  for (const name of ["庐山", "匡庐", "三叠泉", "三塔", "九江", "九江市", "江西", "大理", "大理白族自治州", "大理市"]) {
    assert.ok(vocabulary.includes(name), name);
  }
  assert.equal(adminStem("博尔塔拉蒙古自治州"), "博尔塔拉");
  assert.equal(adminStem("黔东南苗族侗族自治州"), "黔东南");
  assert.equal(adminStem("喀什地区"), "喀什");
  assert.equal(adminStem("兴安盟"), "兴安");
  assert.equal(adminStem("新疆维吾尔自治区"), "新疆");
  assert.equal(adminStem("澳门特别行政区"), "澳门");
  assert.equal(adminStem("庐山"), null);
});
