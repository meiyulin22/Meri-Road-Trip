import assert from "node:assert/strict";
import test from "node:test";

import { catalogEnabled, cityCatalogFromRows, rankCityPreferencesFromEnvironment, recommendCatalogCitiesFromEnvironment } from "./catalog-source";

test("only CATALOG_ENABLED=true turns the catalog on", () => {
  assert.equal(catalogEnabled("true"), true);
  assert.equal(catalogEnabled(" TRUE "), true);
  for (const value of [undefined, "", "false", "1", "yes"]) assert.equal(catalogEnabled(value), false);
});

test("rows become spots with their highlights and dishes with their summary; other kinds are left out", () => {
  const common = { aliases: [], county: null, sourceCount: 2, confidence: "high" as const };
  const catalog = cityCatalogFromRows([
    { ...common, id: "spot_a", kind: "spot", name: "洱海", summary: "湖。", tags: ["水域"], details: {
      highlights: ["湖景"], suggested_hours: null, best_season: null, visit_note: null,
      walking: { distance_m: null, terrain: null, stairs: null },
    } },
    { ...common, id: "dish_a", kind: "dish", name: "乳扇", summary: "奶制品。", tags: ["美食"],
      details: { ingredients: ["牛奶"], flavor: null, preparations: [] } },
    { ...common, id: "tip_a", kind: "tip", name: "提示", summary: "带伞。", tags: ["旅行提示"], details: { applies_in: "全年", advice: "带伞" } },
  ]);
  assert.deepEqual(catalog.spots.map(({ name, highlights, tags }) => [name, highlights, tags]), [["洱海", ["湖景"], ["水域"]]]);
  assert.deepEqual(catalog.dishes, [{ id: "dish_a", name: "乳扇", summary: "奶制品。", sourceCount: 2 }]);
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
