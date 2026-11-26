import { and, cosineDistance, desc, eq, inArray, isNotNull, notInArray, sql } from "drizzle-orm";

import type { CityCatalog, PreferenceRankings } from "@/domain/catalog/catalog-pick";
import { type CatalogCity, type CatalogMatch, scoreCatalogCities } from "@/domain/catalog/city-scores";
import type { CatalogTag } from "@/domain/catalog/catalog-tags";
import { createEmbeddingFromEnvironment, type EmbeddingClient } from "@/platform/embedding/bailian-embedding";
import { logger } from "@/platform/observability/logger";
import { catalogEmbeddingDimensions, catalogEntries } from "@/platform/persistence/database/schema/catalog-entries";

type CatalogDatabase = typeof import("@/platform/persistence/database/db").db;
type CatalogRow = Pick<typeof catalogEntries.$inferSelect,
  "id" | "kind" | "name" | "aliases" | "county" | "summary" | "tags" | "details" | "sourceCount" | "confidence">;

/** Reads one 州/市 of Meri's catalog, the spots and dishes research and What to eat use. */
export type CatalogSource = {
  readonly cityCatalog: (province: string, prefecture: string) => Promise<CityCatalog>;
  /**
   * The city's spot ids for a query (RAG step 3), two lists run side by side: nearest by meaning to
   * `queryVector` (top 50; none without a vector) and names or aliases the query writes (top 20).
   */
  readonly preferenceRankings: (province: string, prefecture: string, query: string, queryVector: readonly number[] | null) => Promise<PreferenceRankings>;
  /**
   * The spots and dishes nearest in meaning across the whole catalog (RAG step 4, top 50), only
   * in `provinces.only` when given, never in `provinces.except`.
   */
  readonly nearestEntries: (queryVector: readonly number[], provinces: ProvinceFilter) => Promise<CatalogMatch[]>;
};

/** Where city recommendations may come from: inside the settled provinces, or outside the saved ones. */
export type ProvinceFilter = { readonly only?: readonly string[]; readonly except?: readonly string[] };

const nearestLimit = 50;

/** Agreed 2026-11-25: vector top 50, names top 20. */
const vectorLimit = 50;
const keywordLimit = 20;
/**
 * word_similarity(name, query) asks how well the name matches some stretch of the query, which fits
 * a long preference holding a short name (最想看玉龙雪山 → 玉龙雪山). pg_trgm's own default is 0.6;
 * 0.5 lets a name written slightly differently still count.
 */
const keywordThreshold = 0.5;

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
    async nearestEntries(queryVector, provinces) {
      const distance = cosineDistance(catalogEntries.embedding, [...queryVector]);
      try {
        const rows = await database.select({
          province: catalogEntries.province,
          city: catalogEntries.prefecture,
          name: catalogEntries.name,
          kind: catalogEntries.kind,
          summary: catalogEntries.summary,
          distance,
        }).from(catalogEntries).where(and(
          inArray(catalogEntries.kind, ["spot", "dish"]),
          isNotNull(catalogEntries.embedding),
          provinces.only?.length ? inArray(catalogEntries.province, [...provinces.only]) : undefined,
          provinces.except?.length ? notInArray(catalogEntries.province, [...provinces.except]) : undefined,
        )).orderBy(distance).limit(nearestLimit);
        return rows.map(({ distance: away, kind, ...row }) => ({ ...row, kind: kind === "dish" ? "dish" : "spot", similarity: 1 - Number(away) }));
      } catch (error) {
        throw new CatalogReadError(provinces.only?.join("、") ?? "全国", "nearest entries", error);
      }
    },
    async preferenceRankings(province, prefecture, query, queryVector) {
      const citySpots = and(
        eq(catalogEntries.province, province),
        eq(catalogEntries.prefecture, prefecture),
        eq(catalogEntries.kind, "spot"),
      );
      const nameMatch = sql<number>`greatest(word_similarity(${catalogEntries.name}, ${query}), word_similarity(${catalogEntries.aliasesText}, ${query}))`;
      try {
        const [vector, keyword] = await Promise.all([
          queryVector
            ? database.select({ id: catalogEntries.id }).from(catalogEntries)
              .where(and(citySpots, isNotNull(catalogEntries.embedding)))
              .orderBy(cosineDistance(catalogEntries.embedding, [...queryVector]))
              .limit(vectorLimit)
            : Promise.resolve([]),
          database.select({ id: catalogEntries.id }).from(catalogEntries)
            .where(and(citySpots, sql`${nameMatch} >= ${keywordThreshold}`))
            .orderBy(desc(nameMatch), catalogEntries.id)
            .limit(keywordLimit),
        ]);
        return { vector: vector.map(({ id }) => id), keyword: keyword.map(({ id }) => id) };
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

let environmentEmbedding: EmbeddingClient | null | undefined;

/**
 * Rankings of the city's catalog spots for the traveller's preferences, or null when the catalog is
 * off. Without an embedding key, or when 百炼 fails, the vector list is empty and the names still
 * count; a database failure throws, and research then ranks by popularity alone.
 */
export async function rankCityPreferencesFromEnvironment(province: string, prefecture: string, query: string): Promise<PreferenceRankings | null> {
  if (!catalogEnabled()) return null;
  if (!environmentSource) {
    const { db } = await import("@/platform/persistence/database/db");
    environmentSource = createPostgresCatalogSource(db);
  }
  if (environmentEmbedding === undefined) environmentEmbedding = createEmbeddingFromEnvironment(catalogEmbeddingDimensions);
  let queryVector: number[] | null = null;
  if (environmentEmbedding) {
    try {
      [queryVector] = await environmentEmbedding.embed([query], AbortSignal.timeout(10_000));
    } catch (error) {
      logger.warn({ city: prefecture, error: error instanceof Error ? error.name : "unknown" }, "Query embedding failed; ranking by names and popularity");
    }
  }
  return environmentSource.preferenceRankings(province, prefecture, query, queryVector);
}

/**
 * Cities the catalog suggests for what the traveller said (RAG step 4), or null when the catalog is
 * off, there is no embedding key, a call fails, or nothing is close enough: then recommendations
 * search the web as before. Failures are logged and never thrown, so a recommendation never fails
 * because of the catalog.
 */
export async function recommendCatalogCitiesFromEnvironment(query: string, provinces: ProvinceFilter): Promise<CatalogCity[] | null> {
  if (!catalogEnabled() || !query.trim()) return null;
  if (environmentEmbedding === undefined) environmentEmbedding = createEmbeddingFromEnvironment(catalogEmbeddingDimensions);
  if (!environmentEmbedding) return null;
  try {
    if (!environmentSource) {
      const { db } = await import("@/platform/persistence/database/db");
      environmentSource = createPostgresCatalogSource(db);
    }
    const [queryVector] = await environmentEmbedding.embed([query], AbortSignal.timeout(10_000));
    const cities = scoreCatalogCities(await environmentSource.nearestEntries(queryVector, provinces));
    return cities.length > 0 ? cities : null;
  } catch (error) {
    logger.warn({ error: error instanceof Error ? error.name : "unknown" }, "Catalog city search failed; recommending from web search");
    return null;
  }
}
