import assert from "node:assert/strict";
import test from "node:test";

import { railCityName, railCityOfRegion } from "./rail-names";

test("12306's short city names from Meri's administrative names (1.2108)", () => {
  assert.equal(railCityName("大理白族自治州"), "大理");
  assert.equal(railCityName("迪庆藏族自治州"), "迪庆");
  assert.equal(railCityName("德宏傣族景颇族自治州"), "德宏");
  assert.equal(railCityName("丽江市"), "丽江");
  assert.equal(railCityName("上海市"), "上海");
  assert.equal(railCityName("丽江"), "丽江");
});

test("a picked origin's city comes from its region", () => {
  assert.equal(railCityOfRegion("上海市闵行区", "上海虹桥站"), "上海");
  assert.equal(railCityOfRegion("云南省丽江市古城区", "丽江古城"), "丽江");
  assert.equal(railCityOfRegion("云南省大理白族自治州大理市", "大理古城"), "大理");
  assert.equal(railCityOfRegion("广西壮族自治区桂林市秀峰区", "桂林站"), "桂林");
  assert.equal(railCityOfRegion(null, "杭州市"), "杭州");
});
