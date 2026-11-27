import assert from "node:assert/strict";
import test from "node:test";

import { type CatalogTip, isFestival, splitTips } from "./catalog-tips";

const tip = (name: string, appliesIn: string, spotIds: string[] = []): CatalogTip =>
  ({ id: `tip_${name}`, name, advice: `${name}的建议`, appliesIn, spotIds });

test("festivals are told by their names or their calendar words", () => {
  assert.equal(isFestival(tip("三月街传统节期", "传统时间为农历三月十五至二十")), true);
  assert.equal(isFestival(tip("香格里拉赛马传统节期", "传统上在端午节前后")), true);
  assert.equal(isFestival(tip("大理早晚温差", "早晚在户外或夏秋雨季")), false);
  assert.equal(isFestival(tip("雪山游览的高海拔与地形", "前往玉龙雪山的高海拔游览区")), false);
});

test("a spot tip goes to each taken spot; city tips and festivals go to the city card, festivals first (RAG step 5)", () => {
  const { bySpot, city } = splitTips([
    tip("雪山游览的高海拔与地形", "前往玉龙雪山的高海拔游览区", ["spot_snow", "spot_meadow"]),
    tip("泸沽湖两侧入口", "规划泸沽湖进出路线", ["spot_lugu"]),
    tip("大理早晚温差", "早晚在户外"),
    tip("丽江七月会", "传统时间为农历七月中旬", ["spot_town"]),
  ], new Set(["spot_snow", "spot_town"]));
  assert.deepEqual([...bySpot.keys()], ["spot_snow"]);
  assert.equal(bySpot.get("spot_snow")?.[0].name, "雪山游览的高海拔与地形");
  // 泸沽湖 was not taken, so its tip is left out; the festival goes to the city card even though it names a spot.
  assert.deepEqual(city.map(({ name, kind }) => [name, kind]), [["丽江七月会", "festival"], ["大理早晚温差", "city"]]);
});
