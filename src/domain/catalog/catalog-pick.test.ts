import assert from "node:assert/strict";
import test from "node:test";

import { type CatalogSpot, catalogOutdoor, findCatalogSpot, fuseRankings, interleave, rankCatalogSpots } from "./catalog-pick";

const spot = (name: string, overrides: Partial<CatalogSpot> = {}): CatalogSpot => ({
  id: `spot_${name}`, name, aliases: [], county: null, summary: `${name}。`, highlights: [], tags: ["自然"],
  sourceCount: 1, confidence: "high", ...overrides,
});

test("outdoor from fixed tags: outdoor tags alone, the hall alone, and anything else unsure", () => {
  assert.equal(catalogOutdoor(["山地", "宗教"]), true);
  assert.equal(catalogOutdoor(["展馆", "历史遗迹"]), false);
  assert.equal(catalogOutdoor(["展馆", "园林公园", "水域"]), null);
  assert.equal(catalogOutdoor(["民俗文化"]), null);
  assert.equal(catalogOutdoor(["洞穴", "地貌"]), true);
  assert.equal(catalogOutdoor(["洞穴"]), null);
});

test("a named county first, then more guides, then surer entries, then the name", () => {
  const ranked = rankCatalogSpots([
    spot("乙", { sourceCount: 2, confidence: "medium" }),
    spot("甲", { sourceCount: 2, confidence: "high" }),
    spot("丙", { sourceCount: 3 }),
    spot("丁", { sourceCount: 1, county: "大理市" }),
  ], ["大理市"]);
  assert.deepEqual(ranked.map(({ name }) => name), ["丁", "丙", "甲", "乙"]);
});

test("a traveller's name finds the spot by its name or an alias, and nothing else", () => {
  const spots = [spot("噶丹松赞林寺", { aliases: ["松赞林寺"] }), spot("洱海")];
  assert.equal(findCatalogSpot(spots, "松赞林寺")?.name, "噶丹松赞林寺");
  assert.equal(findCatalogSpot(spots, "洱海")?.name, "洱海");
  assert.equal(findCatalogSpot(spots, "苍山"), null);
});

test("RRF adds 1/(60 + rank) from each list, so being high in two lists counts most", () => {
  const scores = fuseRankings([["a", "b"], ["b", "c"]]);
  assert.equal(scores.get("a"), 1 / 61);
  assert.equal(scores.get("b"), 1 / 62 + 1 / 61);
  assert.equal(scores.get("c"), 1 / 62);
});

test("taking turns: each list's best first, an id already taken is skipped", () => {
  assert.deepEqual(interleave([["雪山", "寺", "湖"], ["古城", "雪山", "街"]]), ["雪山", "古城", "寺", "湖", "街"]);
  assert.deepEqual(interleave([[], ["古城"]]), ["古城"]);
});

test("with preferences, the best answer and the most popular take turns; a named county still comes first (RAG step 3)", () => {
  const spots = [
    spot("拉市海", { sourceCount: 4 }), spot("丽江古城", { sourceCount: 4 }), spot("束河古镇", { sourceCount: 3 }),
    spot("玉龙雪山", { sourceCount: 2 }), spot("牦牛坪", { sourceCount: 2 }), spot("泸沽湖", { sourceCount: 4, county: "宁蒗县" }),
  ];
  const rankings = { vector: ["spot_玉龙雪山", "spot_牦牛坪", "spot_外城的"], keyword: ["spot_玉龙雪山"] };
  assert.deepEqual(rankCatalogSpots(spots, [], rankings).slice(0, 4).map(({ name }) => name), ["玉龙雪山", "拉市海", "牦牛坪", "丽江古城"]);
  assert.equal(rankCatalogSpots(spots, ["宁蒗县"], rankings)[0].name, "泸沽湖");
  // No rankings, or empty ones: popularity alone, as before step 3.
  assert.deepEqual(rankCatalogSpots(spots, [], { vector: [], keyword: [] }).map(({ name }) => name),
    rankCatalogSpots(spots, []).map(({ name }) => name));
});
