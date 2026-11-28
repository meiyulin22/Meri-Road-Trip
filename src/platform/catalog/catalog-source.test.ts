import assert from "node:assert/strict";
import test from "node:test";

import { catalogEnabled, cityCatalogFromRows, rankCityPreferencesFromEnvironment, recommendCatalogCitiesFromEnvironment } from "./catalog-source";

test("only CATALOG_ENABLED=true turns the catalog on", () => {
  assert.equal(catalogEnabled("true"), true);
  assert.equal(catalogEnabled(" TRUE "), true);
  for (const value of [undefined, "", "false", "1", "yes"]) assert.equal(catalogEnabled(value), false);
});

test("rows become spots with their highlights, dishes with their summary and tips with the spots they apply to", () => {
  const common = { aliases: [], county: null, sourceCount: 2, confidence: "high" as const, related: [] };
  const catalog = cityCatalogFromRows([
    { ...common, id: "spot_a", kind: "spot", name: "洱海", summary: "湖。", tags: ["水域"], details: {
      highlights: ["湖景"], suggested_hours: null, best_season: null, visit_note: null,
      walking: { distance_m: null, terrain: null, stairs: null },
    } },
    { ...common, id: "dish_a", kind: "dish", name: "乳扇", summary: "奶制品。", tags: ["美食"],
      details: { ingredients: ["牛奶"], flavor: null, preparations: [] } },
    { ...common, id: "tip_a", kind: "tip", name: "提示", summary: "带伞。", tags: ["旅行提示"], details: { applies_in: "全年", advice: "带伞" },
      related: [{ id: "spot_a", relation: "applies_to" }, { id: "spot_b", relation: "nearby" }] },
    { ...common, id: "way_a", kind: "transport", name: "古城到洱海", summary: "可坐公交。", tags: ["交通"],
      details: { from: "古城", to: "洱海", modes: ["公交", "骑行"] }, related: [{ id: "spot_a", relation: "destination" }] },
    { ...common, id: "stay_area", kind: "stay", name: "古城住宿区", summary: "适合住。", tags: ["住宿"],
      details: { stay_type: "area", area: "古城", features: ["院落客栈"], branch: null, address: null }, related: [{ id: "spot_a", relation: "nearby" }] },
    { ...common, id: "stay_inn", kind: "stay", name: "某客栈", summary: "一家客栈。", tags: ["住宿"],
      details: { stay_type: "property", area: "古城", features: [], branch: null, address: "某路 1 号" } },
  ]);
  assert.deepEqual(catalog.spots.map(({ name, highlights, tags }) => [name, highlights, tags]), [["洱海", ["湖景"], ["水域"]]]);
  assert.deepEqual(catalog.dishes, [{ id: "dish_a", name: "乳扇", summary: "奶制品。", sourceCount: 2 }]);
  // A tip keeps its advice and the spots it applies to; other relations are not "applies to".
  assert.deepEqual(catalog.tips, [{ id: "tip_a", name: "提示", advice: "带伞", appliesIn: "全年", spotIds: ["spot_a"] }]);
  assert.deepEqual(catalog.transport, [{ id: "way_a", from: "古城", to: "洱海", modes: ["公交", "骑行"], spotIds: ["spot_a"] }]);
  // A stay area is kept; a single guesthouse is not: hotels come from RollingGo.
  assert.deepEqual(catalog.stayAreas, [{ id: "stay_area", name: "古城", features: ["院落客栈"], spotIds: ["spot_a"] }]);
});

test("a spot or dish with a saved photo carries it; one without has no photo field", () => {
  const common = { aliases: [], county: null, sourceCount: 2, confidence: "high" as const, related: [], summary: "介绍。" };
  const spot = (id: string) => ({ ...common, id, kind: "spot" as const, name: id, tags: ["山地"], details: {
    highlights: [], suggested_hours: null, best_season: null, visit_note: null,
    walking: { distance_m: null, terrain: null, stairs: null },
  } });
  const catalog = cityCatalogFromRows([
    spot("spot_dali_cangshan"),
    spot("spot_without_photo"),
    { ...common, id: "dish_beijing_roast_duck", kind: "dish", name: "北京烤鸭", tags: ["美食"],
      details: { ingredients: [], flavor: null, preparations: [] } },
  ]);
  assert.equal(catalog.spots[0].photo?.url, "/photos/catalog/spot_dali_cangshan.avif");
  assert.ok(catalog.spots[0].photo?.author);
  assert.equal("photo" in catalog.spots[1], false);
  assert.equal(catalog.dishes[0].photo?.url, "/photos/catalog/dish_beijing_roast_duck.avif");
});

test("without CATALOG_ENABLED the preference ranking reads nothing", async () => {
  const saved = process.env.CATALOG_ENABLED;
  delete process.env.CATALOG_ENABLED;
  try {
    assert.equal(await rankCityPreferencesFromEnvironment("云南省", "丽江市", "雪山"), null);
  } finally {
    if (saved !== undefined) process.env.CATALOG_ENABLED = saved;
  }
});

test("without CATALOG_ENABLED no city is suggested and nothing is embedded", async () => {
  const saved = process.env.CATALOG_ENABLED;
  delete process.env.CATALOG_ENABLED;
  try {
    assert.equal(await recommendCatalogCitiesFromEnvironment("想看雪山", {}), null);
  } finally {
    if (saved !== undefined) process.env.CATALOG_ENABLED = saved;
  }
});
