import assert from "node:assert/strict";
import test from "node:test";

import { type CatalogSpot, catalogOutdoor, findCatalogSpot, rankCatalogSpots } from "./catalog-pick";

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
