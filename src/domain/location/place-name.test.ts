import assert from "node:assert/strict";
import test from "node:test";

import { isFacilityName } from "./place-name";

test("a facility suffix marks the name as a part of the place, not the place", () => {
  for (const name of ["稻城亚丁风景区仁村观景台", "黄山风景区北门", "黄山风景区东大门",
    "玉龙雪山游客中心", "黄山风景区停车场", "苍山中和索道", "丽江古城售票处", "景区入口"]) {
    assert.equal(isFacilityName(name), true, name);
  }
});

test("a place whose own name merely ends in a common character is not a facility", () => {
  // 天安门 must stay a sight: only 北门/南门/大门 and the like are facility endings.
  for (const name of ["天安门", "黄山风景区", "甘孜州稻城亚丁景区", "玉龙雪山国家级风景名胜区",
    "西湖", "观复博物馆", "亚丁"]) {
    assert.equal(isFacilityName(name), false, name);
  }
});
