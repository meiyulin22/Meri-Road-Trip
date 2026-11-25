import { sql } from "drizzle-orm";
import { check, customType, index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { type CatalogEntry, catalogKinds } from "@/domain/catalog/catalog-entry";

/**
 * A pgvector column without a fixed size: the embedding provider is not chosen yet, so
 * step 3 of the catalog work sets the dimensions, fills it and adds the vector index.
 */
const unsizedVector = customType<{ data: number[]; driverData: string }>({
  dataType: () => "vector",
  toDriver: (value) => `[${value.join(",")}]`,
  fromDriver: (value) => JSON.parse(value) as number[],
});

/**
 * Meri's own catalog of spots, dishes, restaurants, stays, transport and tips, imported from
 * the private meri-catalog-cn repo by scripts/import-catalog.ts (the id is the catalog's own).
 * `historical` and `source_refs` are provenance only and are never shown.
 */
export const catalogEntries = pgTable("catalog_entries", {
  id: text("id").primaryKey(),
  kind: text("kind").$type<CatalogEntry["kind"]>().notNull(),
  name: text("name").notNull(),
  aliases: text("aliases").array().notNull(),
  aliasesText: text("aliases_text").notNull(),
  province: text("province").notNull(),
  prefecture: text("prefecture").notNull(),
  county: text("county"),
  summary: text("summary").notNull(),
  /** Fixed tags from src/domain/catalog/catalog-tags.ts. */
  tags: text("tags").array().notNull(),
  /** The catalog's own free tags, kept so the mapping can be redone. */
  tagsRaw: text("tags_raw").array().notNull(),
  details: jsonb("details").$type<CatalogEntry["details"]>().notNull(),
  related: jsonb("related").$type<CatalogEntry["related"]>().notNull(),
  historical: jsonb("historical").$type<CatalogEntry["historical"]>(),
  sourceRefs: jsonb("source_refs").$type<CatalogEntry["source_refs"]>().notNull(),
  confidence: text("confidence").$type<CatalogEntry["confidence"]>().notNull(),
  sourceCount: integer("source_count").notNull(),
  searchText: text("search_text").notNull(),
  embedding: unsizedVector("embedding"),
  /** The meri-catalog-cn commit the row came from, with -dirty when that tree had changes. */
  catalogVersion: text("catalog_version").notNull(),
  importedAt: timestamp("imported_at", { mode: "string", withTimezone: true }).notNull(),
}, (table) => [
  index("catalog_entries_prefecture_kind_idx").on(table.prefecture, table.kind),
  index("catalog_entries_name_trgm_idx").using("gin", table.name.op("gin_trgm_ops")),
  index("catalog_entries_aliases_trgm_idx").using("gin", table.aliasesText.op("gin_trgm_ops")),
  check("catalog_entries_kind_check", sql.raw(`kind IN (${catalogKinds.map((kind) => `'${kind}'`).join(", ")})`)),
  check("catalog_entries_confidence_check", sql`${table.confidence} IN ('high', 'medium', 'low')`),
]);
