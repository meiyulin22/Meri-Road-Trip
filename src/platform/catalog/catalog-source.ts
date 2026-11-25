import { and, eq, inArray } from "drizzle-orm";

import type { CityCatalog } from "@/domain/catalog/catalog-pick";
import type { CatalogTag } from "@/domain/catalog/catalog-tags";
import { catalogEntries } from "@/platform/persistence/database/schema/catalog-entries";

type CatalogDatabase = typeof import("@/platform/persistence/database/db").db;
type CatalogRow = Pick<typeof catalogEntries.$inferSelect,
  "id" | "kind" | "name" | "aliases" | "county" | "summary" | "tags" | "details" | "sourceCount" | "confidence">;

/** Reads one 州/市 of Meri's catalog, the spots and dishes research and What to eat use. */
export type CatalogSource = {
  readonly cityCatalog: (province: string, prefecture: string) => Promise<CityCatalog>;
};

export class CatalogReadError extends Error {
  constructor(province: string, prefecture: string, cause: unknown) {
    super(`Failed to read the catalog for ${province} ${prefecture}.`, { cause });
    this.name = "CatalogReadError";
  }
}

/** Rows to the domain shape; tags and details were validated by the import. */
export function cityCatalogFromRows(rows: readonly CatalogRow[]): CityCatalog {
  const spots = rows.flatMap((row) => row.kind === "spot" && "highlights" in row.details ? [{
    id: row.id,
    name: row.name,
    aliases: row.aliases,
    county: row.county,
    summary: row.summary,
    highlights: row.details.highlights,
    tags: row.tags as CatalogTag[],
    sourceCount: row.sourceCount,
    confidence: row.confidence,
  }] : []);
  const dishes = rows.flatMap((row) => row.kind === "dish"
    ? [{ id: row.id, name: row.name, summary: row.summary, sourceCount: row.sourceCount }]
    : []);
  return { spots, dishes };
}

export function createPostgresCatalogSource(database: CatalogDatabase): CatalogSource {
  return {
    async cityCatalog(province, prefecture) {
      try {
        const rows = await database.select({
          id: catalogEntries.id,
          kind: catalogEntries.kind,
          name: catalogEntries.name,
          aliases: catalogEntries.aliases,
          county: catalogEntries.county,
          summary: catalogEntries.summary,
          tags: catalogEntries.tags,
          details: catalogEntries.details,
          sourceCount: catalogEntries.sourceCount,
          confidence: catalogEntries.confidence,
        }).from(catalogEntries).where(and(
          eq(catalogEntries.province, province),
          eq(catalogEntries.prefecture, prefecture),
          inArray(catalogEntries.kind, ["spot", "dish"]),
        ));
        return cityCatalogFromRows(rows);
      } catch (error) {
        throw new CatalogReadError(province, prefecture, error);
      }
    },
  };
}

/** CATALOG_ENABLED=true turns the catalog on; anything else keeps research exactly as before it. */
export function catalogEnabled(value: string | undefined = process.env.CATALOG_ENABLED): boolean {
  return value?.trim().toLowerCase() === "true";
}

let environmentSource: CatalogSource | null = null;

/**
 * The city's catalog when CATALOG_ENABLED=true, else null. The database client is loaded on first
 * use, so code that never reads the catalog (tests, the switch off) needs no DATABASE_URL.
 */
export async function readCityCatalogFromEnvironment(province: string, prefecture: string): Promise<CityCatalog | null> {
  if (!catalogEnabled()) return null;
  if (!environmentSource) {
    const { db } = await import("@/platform/persistence/database/db");
    environmentSource = createPostgresCatalogSource(db);
  }
  return environmentSource.cityCatalog(province, prefecture);
}
