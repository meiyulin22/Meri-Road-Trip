import assert from "node:assert/strict";
import test from "node:test";

import { isChinaProvince } from "./china-destination-scope";
import { provincesOfRegionNickname } from "./china-region-nicknames";

test("everyday names for several provinces stand for exactly those provinces", () => {
  assert.deepEqual(provincesOfRegionNickname("江浙沪"), ["江苏省", "浙江省", "上海市"]);
  assert.deepEqual(provincesOfRegionNickname("京津冀"), ["北京市", "天津市", "河北省"]);
  assert.deepEqual(provincesOfRegionNickname("川渝"), ["四川省", "重庆市"]);
  assert.deepEqual(provincesOfRegionNickname("云贵川"), ["云南省", "贵州省", "四川省"]);
  assert.deepEqual(provincesOfRegionNickname("东三省"), ["辽宁省", "吉林省", "黑龙江省"]);
  assert.deepEqual(provincesOfRegionNickname("两广"), ["广东省", "广西壮族自治区"]);
  assert.deepEqual(provincesOfRegionNickname("港澳"), ["香港特别行政区", "澳门特别行政区"]);
});

test("「一带」, 「地区」 and stray spaces do not change which provinces are meant", () => {
  assert.deepEqual(provincesOfRegionNickname(" 江浙沪一带 "), ["江苏省", "浙江省", "上海市"]);
  assert.deepEqual(provincesOfRegionNickname("京津冀地区"), ["北京市", "天津市", "河北省"]);
});

test("a place, a province, a disputed region or an object key is not a nickname", () => {
  for (const words of ["江苏", "上海", "潮汕", "长三角", "东北", "江浙沪菜馆", "toString", "constructor", ""]) {
    assert.equal(provincesOfRegionNickname(words), null, words);
  }
});

test("every province a nickname names is inside the product's coverage", () => {
  for (const words of ["江浙沪", "苏浙沪", "江浙", "京津冀", "京津", "川渝", "云贵川", "云贵", "东三省", "东北三省",
    "两广", "港澳", "两湖"]) {
    const provinces = provincesOfRegionNickname(words);
    assert.ok(provinces !== null && provinces.every((province) => isChinaProvince(province)), words);
  }
});
