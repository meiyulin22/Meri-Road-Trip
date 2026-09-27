import assert from "node:assert/strict";
import test from "node:test";
import { deduplicateRecommendationDestinations } from "./recommendation-identity";

const unique = <T extends { name: string; region: string | null; providerIdentity?: string }>(items: T[]) =>
  deduplicateRecommendationDestinations(items, (item) => item);

test("exact, whitespace, fullwidth and scenic suffix variants keep the earliest destination", () => {
  const first = { name: "梅里雪山", region: "云南" };
  assert.deepEqual(unique([first, { ...first }, { name: " 梅 里 雪 山 景区 ", region: "云南省" },
    { name: "梅里雪山（风景名胜区）", region: "云南" }, { name: "梅里\u200B雪山", region: "云南" }]), [first]);
  assert.equal(unique([first, { name: "梅里雪山风景区", region: null }])[0], first);
});

test("similar names, route variants, peaks and known different regions remain separate", () => {
  const items = ["贡嘎山", "贡嘎环线", "贡嘎大环线", "四姑娘山", "四姑娘山大峰", "四姑娘山二峰",
    "黄山", "黄山区"].map((name) => ({ name, region: "四川" }));
  items.push({ name: "西湖", region: "浙江" }, { name: "西湖", region: "广东" });
  assert.deepEqual(unique(items), items);
});

test("same reliable provider identity collapses aliases but does not reorder remaining destinations", () => {
  const first = { name: "甲名称", region: null, providerIdentity: "amap:poi-a" };
  const other = { name: "甲山", region: null, providerIdentity: "amap:poi-b" };
  assert.deepEqual(unique([first, other, { name: "另一个名称", region: "云南", providerIdentity: "amap:poi-a" }]),
    [first, other]);
});
