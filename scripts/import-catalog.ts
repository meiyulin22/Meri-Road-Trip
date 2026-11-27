/**
 * Imports Meri's catalog (the private meri-catalog-cn repo) into catalog_entries.
 *
 *   node --env-file=.env.local --import tsx scripts/import-catalog.ts [--dry-run]
 *
 * CATALOG_DIR is the repo's root; DATABASE_URL may be any Postgres, including a server's
 * reached through an SSH tunnel. Every line is validated first and any problem stops the
 * run before a row is written. Then, in one transaction, rows are upserted by id and rows
 * the catalog no longer has are deleted, so running it again is safe.
 *
 * data/enrichment/summaries.ndjson, when present, holds summaries rewritten in Meri's voice (B2); each
 * replaces the catalog's own summary if it was written for it. A changed summary changes search_text,
 * which clears that row's vector: run scripts/embed-catalog.ts afterwards.
 */
import { execFileSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { notInArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import type { CatalogRow } from "@/domain/catalog/catalog-row";
import { catalogEntries } from "@/platform/persistence/database/schema/catalog-entries";

import { type CatalogFile, countChanges, type EnrichmentFile, readCatalog } from "./import-catalog-read";

const insertBatchSize = 200;

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not set; add it to .env.local.`);
  }
  return value;
}

/** The catalog commit, marked -dirty when its tree has changes not yet committed. */
function catalogVersion(catalogDir: string): string {
  const head = execFileSync("git", ["-C", catalogDir, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const status = execFileSync("git", ["-C", catalogDir, "status", "--porcelain", "--", "data"], { encoding: "utf8" });
  return status.trim().length > 0 ? `${head}-dirty` : head;
}

async function readCityFiles(catalogDir: string): Promise<CatalogFile[]> {
  const citiesDir = join(catalogDir, "data", "cities");
  const names = (await readdir(citiesDir)).filter((name) => name.endsWith(".ndjson")).sort();
  return Promise.all(names.map(async (name) => {
    const path = join(citiesDir, name);
    return { path, text: await readFile(path, "utf8") };
  }));
}

async function readEnrichmentFile(catalogDir: string): Promise<EnrichmentFile | null> {
  const path = join(catalogDir, "data", "enrichment", "summaries.ndjson");
  try {
    return { path, text: await readFile(path, "utf8") };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function toInsert(row: CatalogRow, version: string, importedAt: string): typeof catalogEntries.$inferInsert {
  return {
    ...row,
    aliases: [...row.aliases],
    tags: [...row.tags],
    tagsRaw: [...row.tagsRaw],
    catalogVersion: version,
    importedAt,
  };
}

function kindCounts(rows: readonly CatalogRow[]): string {
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.kind, (counts.get(row.kind) ?? 0) + 1);
  }
  return [...counts].map(([kind, count]) => `${kind} ${count}`).join(", ");
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { "dry-run": { type: "boolean", default: false } } });
  const dryRun = values["dry-run"];
  const catalogDir = requireEnv("CATALOG_DIR");
  const databaseUrl = requireEnv("DATABASE_URL");

  const version = catalogVersion(catalogDir);
  const read = readCatalog(await readCityFiles(catalogDir), await readEnrichmentFile(catalogDir));
  for (const warning of read.warnings) {
    process.stdout.write(`warning: ${warning}\n`);
  }
  if (read.problems.length > 0) {
    process.stderr.write(`${read.problems.map((problem) => `problem: ${problem}`).join("\n")}\n`);
    throw new Error(`Catalog import stopped: ${read.problems.length} problems in ${catalogDir}; nothing was written.`);
  }
  process.stdout.write(`catalog ${version}: ${read.rows.length} entries (${kindCounts(read.rows)}), ${read.enriched} summaries from the enrichment file\n`);

  const pool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 5_000 });
  const db = drizzle(pool);
  try {
    const existing = await db.select({ id: catalogEntries.id }).from(catalogEntries);
    const counts = countChanges(new Set(existing.map((row) => row.id)), read.rows);
    process.stdout.write(`${dryRun ? "would add" : "adding"} ${counts.added}, update ${counts.updated}, remove ${counts.removed}\n`);
    if (dryRun) {
      return;
    }

    const importedAt = new Date().toISOString();
    const inserts = read.rows.map((row) => toInsert(row, version, importedAt));
    await db.transaction(async (tx) => {
      for (let start = 0; start < inserts.length; start += insertBatchSize) {
        await tx.insert(catalogEntries).values(inserts.slice(start, start + insertBatchSize)).onConflictDoUpdate({
          target: catalogEntries.id,
          set: {
            kind: sql`excluded.kind`,
            name: sql`excluded.name`,
            aliases: sql`excluded.aliases`,
            aliasesText: sql`excluded.aliases_text`,
            province: sql`excluded.province`,
            prefecture: sql`excluded.prefecture`,
            county: sql`excluded.county`,
            summary: sql`excluded.summary`,
            tags: sql`excluded.tags`,
            tagsRaw: sql`excluded.tags_raw`,
            details: sql`excluded.details`,
            related: sql`excluded.related`,
            historical: sql`excluded.historical`,
            sourceRefs: sql`excluded.source_refs`,
            confidence: sql`excluded.confidence`,
            sourceCount: sql`excluded.source_count`,
            searchText: sql`excluded.search_text`,
            // An embedding describes the old text; drop it when the text changes so step 3 re-embeds it.
            embedding: sql`CASE WHEN ${catalogEntries.searchText} = excluded.search_text THEN ${catalogEntries.embedding} ELSE NULL END`,
            catalogVersion: sql`excluded.catalog_version`,
            importedAt: sql`excluded.imported_at`,
          },
        });
      }
      await tx.delete(catalogEntries).where(notInArray(catalogEntries.id, read.rows.map((row) => row.id)));
    });
    process.stdout.write("done\n");
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
