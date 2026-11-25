import assert from "node:assert/strict";
import test from "node:test";

import { type CatalogEntry, catalogEntrySchema } from "./catalog-entry";
import { buildSearchText, toCatalogRow } from "./catalog-row";
import { normaliseCatalogTags, spotTagMap, spotTags } from "./catalog-tags";

const spot = {
  schema_version: 1,
  id: "spot_test_lake",
  kind: "spot",
  name: "测试湖",
  aliases: ["小湖"],
  location: { province: "云南省", prefecture: "测试州", county: null },
  summary: "一片湖。",
  tags: ["湖泊", "拍照", "步行", "自然"],
  details: {
    highlights: ["湖边小路"],
    suggested_hours: null,
    best_season: "春季",
    visit_note: null,
    walking: { distance_m: null, terrain: null, stairs: null },
  },
  related: [],
  historical: { price_note: "旧票价" },
  source_refs: [{ document_id: "guide_a", pdf_pages: [3], guide_year: null }, { document_id: "guide_b", pdf_pages: [9], guide_year: null }],
  confidence: "high",
  identity_check: { status: "pending", provider: null, poi_id: null },
};

const dish = {
  ...spot,
  id: "dish_test_cheese",
  kind: "dish",
  name: "乳饼",
  aliases: [],
  tags: ["美食"],
  details: { ingredients: ["羊奶"], flavor: null, preparations: ["煎"] },
  historical: null,
  identity_check: null,
};

function parse(value: unknown): CatalogEntry {
  return catalogEntrySchema.parse(value);
}

test("a spot's free tags fold into fixed tags, in the fixed order, without repeats", () => {
  const result = normaliseCatalogTags(parse({ ...spot, tags: ["步行", "湖泊", "瀑布", "拍照"] }));
  assert.deepEqual(result, { ok: true, tags: ["水域", "徒步", "观景"] });
});

test("an unknown tag is reported, so the mapping is extended on purpose", () => {
  const result = normaliseCatalogTags(parse({ ...spot, tags: ["湖泊", "外星基地"] }));
  assert.deepEqual(result, { ok: false, unknownTags: ["外星基地"] });
});

test("entries of other kinds take their kind as the only tag", () => {
  assert.deepEqual(normaliseCatalogTags(parse(dish)), { ok: true, tags: ["美食"] });
});

test("every raw tag maps to a fixed tag that exists", () => {
  const fixed = new Set<string>(spotTags);
  for (const [raw, tag] of spotTagMap) {
    assert.ok(fixed.has(tag), `${raw} → ${tag}`);
  }
});

test("a row keeps provenance, counts sources and joins aliases for name matching", () => {
  const result = toCatalogRow(parse(spot));
  assert.ok(result.ok);
  assert.equal(result.row.sourceCount, 2);
  assert.equal(result.row.aliasesText, "小湖");
  assert.deepEqual(result.row.tags, ["水域", "自然", "徒步", "观景"]);
  assert.deepEqual(result.row.tagsRaw, ["湖泊", "拍照", "步行", "自然"]);
  assert.deepEqual(result.row.historical, { price_note: "旧票价" });
  assert.equal(result.row.prefecture, "测试州");
});

test("search text is names, kind, fixed tags, summary and a spot's highlights", () => {
  const entry = parse(spot);
  assert.equal(buildSearchText(entry, ["水域", "观景"]), "测试湖 小湖 景点 水域 观景 一片湖。 湖边小路");
  assert.equal(buildSearchText(parse(dish), ["美食"]), "乳饼 特色菜 美食 一片湖。");
});

test("the schema rejects unknown fields and a wrong details shape", () => {
  assert.equal(catalogEntrySchema.safeParse({ ...spot, extra: 1 }).success, false);
  assert.equal(catalogEntrySchema.safeParse({ ...spot, details: dish.details }).success, false);
  assert.equal(catalogEntrySchema.safeParse({ ...spot, source_refs: [] }).success, false);
  assert.equal(catalogEntrySchema.safeParse({ ...spot, schema_version: 2 }).success, false);
});
