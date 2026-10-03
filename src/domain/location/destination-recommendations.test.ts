import assert from "node:assert/strict";
import test from "node:test";

import { validateDestinationRecommendations } from "./destination-recommendations";
import { domesticProvinces, isDomesticProvince } from "./domestic-destination-scope";

const place = (name: string) => ({ name, reason: "适合这次的偏好" });

test("domestic coverage accepts exact province names and common short names, not foreign or invented regions", () => {
  for (const province of [...domesticProvinces, "云南", "广西", "北京", "香港", "澳门", "台湾"]) {
    assert.equal(isDomesticProvince(province), true, province);
  }
  for (const province of [null, undefined, "", "北海道", "京都府", "安大略省", "云南省海外", "东京市", "中国", "内蒙"]) {
    assert.equal(isDomesticProvince(province), false, String(province));
  }
});

test("foreign provinces invalidate the entire model recommendation batch before cards are created", () => {
  assert.throws(() => validateDestinationRecommendations({ provinces: [
    { province: "云南省", places: [place("丽江市")] },
    { province: "北海道", places: [place("札幌市")] },
  ] }));
});

test("places keep their province, their order, and the province spelling the model used", () => {
  assert.deepEqual(validateDestinationRecommendations({ provinces: [
    { province: "云南省", places: [place("丽江市"), place("迪庆藏族自治州")] },
    { province: "四川省", places: [place("甘孜藏族自治州")] },
  ] }), [
    { province: "云南省", places: [place("丽江市"), place("迪庆藏族自治州")] },
    { province: "四川省", places: [place("甘孜藏族自治州")] },
  ]);
});

test("the same province written two ways is one group, and its later places are dropped", () => {
  assert.deepEqual(validateDestinationRecommendations({ provinces: [
    { province: "云南省", places: [place("丽江市")] },
    { province: "云南", places: [place("大理白族自治州")] },
  ] }), [{ province: "云南省", places: [place("丽江市")] }]);
});

test("a name repeated inside one province is a duplicate; the same name in another is not", () => {
  assert.deepEqual(validateDestinationRecommendations({ provinces: [
    { province: "北京市", places: [place("朝阳区"), place("朝阳区 ")] },
    { province: "辽宁省", places: [place("朝阳市")] },
  ] }), [
    { province: "北京市", places: [place("朝阳区")] },
    { province: "辽宁省", places: [place("朝阳市")] },
  ]);
});

test("a thirteenth place is trimmed rather than losing the whole round", () => {
  const groups = validateDestinationRecommendations({ provinces: [
    { province: "云南省", places: Array.from({ length: 6 }, (_, index) => place(`甲${index}市`)) },
    { province: "四川省", places: Array.from({ length: 6 }, (_, index) => place(`乙${index}市`)) },
    { province: "贵州省", places: [place("遵义市")] },
  ] });
  assert.deepEqual(groups.map((group) => [group.province, group.places.length]),
    [["云南省", 6], ["四川省", 6]]);
});

test("output that is not a grouped list of places is refused", () => {
  for (const invalid of [
    {},
    { provinces: [] },
    { provinces: [{ province: "云南省", places: [] }] },
    { provinces: [{ province: "", places: [place("丽江市")] }] },
    { provinces: [{ province: "云南省", places: [{ name: "丽江市" }] }] },
    { provinces: [{ province: "云南省", places: [{ name: "丽江市", reason: "好", extra: 1 }] }] },
    { provinces: [{ province: "云南省", places: [place("丽江市")], imageUrl: null }] },
    { provinces: Array.from({ length: 5 }, (_, index) => ({ province: `省${index}`, places: [place("甲市")] })) },
    { provinces: [{ province: "云南省", places: Array.from({ length: 7 }, (_, index) => place(`甲${index}市`)) }] },
    { provinces: [{ province: "云南省", places: [place("名".repeat(31))] }] },
    { provinces: [{ province: "云南省", places: [{ name: "丽江市", reason: "理".repeat(121) }] }] },
    // A trimmed-to-nothing name leaves no place behind, so the whole answer is unusable.
    { provinces: [{ province: "云南省", places: [{ name: "   ", reason: "适合这次的偏好" }] }] },
  ]) {
    assert.throws(() => validateDestinationRecommendations(invalid), Error, JSON.stringify(invalid));
  }
});
