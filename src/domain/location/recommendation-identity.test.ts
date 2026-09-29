import assert from "node:assert/strict";
import test from "node:test";
import { normalizeRecommendationName, normalizeRecommendationRegion } from "./recommendation-identity";

test("whitespace, fullwidth and scenic suffix variants of a name read as the same place", () => {
  const meili = normalizeRecommendationName("梅里雪山");
  for (const variant of [" 梅 里 雪 山 景区 ", "梅里雪山（风景名胜区）", "梅里\u200B雪山", "梅里雪山风景区"]) {
    assert.equal(normalizeRecommendationName(variant), meili);
  }
});

test("similar names, route variants and peaks stay apart", () => {
  const names = ["贡嘎山", "贡嘎环线", "贡嘎大环线", "四姑娘山", "四姑娘山大峰", "四姑娘山二峰", "黄山", "黄山区"];
  const normalized = names.map(normalizeRecommendationName);
  assert.equal(new Set(normalized).size, names.length);
});

test("a name that is only a suffix keeps it, because stripping it would leave nothing to match on", () => {
  assert.equal(normalizeRecommendationName("景区"), "景区");
});

test("a province reads the same whether or not it is written in full", () => {
  assert.equal(normalizeRecommendationRegion("云南"), normalizeRecommendationRegion("云南省"));
  assert.equal(normalizeRecommendationRegion("广西"), normalizeRecommendationRegion("广西壮族自治区"));
  assert.equal(normalizeRecommendationRegion("宁夏"), normalizeRecommendationRegion("宁夏回族自治区"));
  assert.equal(normalizeRecommendationRegion("新疆"), normalizeRecommendationRegion("新疆维吾尔自治区"));
  assert.equal(normalizeRecommendationRegion("西藏"), normalizeRecommendationRegion("西藏自治区"));
  assert.equal(normalizeRecommendationRegion("香港"), normalizeRecommendationRegion("香港特别行政区"));
  assert.notEqual(normalizeRecommendationRegion("河南"), normalizeRecommendationRegion("湖南"));
  // 市 is not stripped: a municipality is a province, and 北京市 is also a city name.
  assert.equal(normalizeRecommendationRegion("北京市"), "北京市");
});
