/**
 * Fills catalog_entries.embedding for rows that have none (RAG step 3): new rows, and rows whose
 * search_text changed at the last import. Run again at any time; it only embeds what is missing.
 *
 *   node --env-file=.env.local --import tsx scripts/embed-catalog.ts [--dry-run]
 *
 * Needs DASHSCOPE_API_KEY and EMBEDDING_BASE_URL (百炼), DATABASE_URL like the import. A failed
 * request stops the run; vectors already written stay.
 */
import { parseArgs } from "node:util";

import { and, asc, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { createEmbeddingFromEnvironment, maxTextsPerRequest } from "@/platform/embedding/bailian-embedding";
import { catalogEmbeddingDimensions, catalogEntries } from "@/platform/persistence/database/schema/catalog-entries";

import { embeddingBatches } from "./embed-catalog-batches";

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { "dry-run": { type: "boolean", default: false } } });
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is not set; add it to .env.local.");
  const client = createEmbeddingFromEnvironment(catalogEmbeddingDimensions);
  if (!client) throw new Error("DASHSCOPE_API_KEY and EMBEDDING_BASE_URL are needed; add them to .env.local.");

  const pool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 5_000 });
  const db = drizzle(pool);
  try {
    const pending = await db.select({ id: catalogEntries.id, searchText: catalogEntries.searchText })
      .from(catalogEntries).where(isNull(catalogEntries.embedding)).orderBy(asc(catalogEntries.id));
    const batches = embeddingBatches(pending, maxTextsPerRequest);
    const characters = pending.reduce((sum, { searchText }) => sum + searchText.length, 0);
    process.stdout.write(`${client.model} ${client.dimensions}d: ${pending.length} rows without a vector, ${characters} characters, ${batches.length} requests\n`);
    if (values["dry-run"] || pending.length === 0) return;

    let written = 0;
    for (const [index, batch] of batches.entries()) {
      const vectors = await client.embed(batch.map(({ searchText }) => searchText), AbortSignal.timeout(30_000));
      for (const [row, vector] of batch.map((item, position) => [item, vectors[position]] as const)) {
        // Only if the text is still the one embedded: an import in between would have changed it.
        const updated = await db.update(catalogEntries).set({ embedding: vector })
          .where(and(eq(catalogEntries.id, row.id), eq(catalogEntries.searchText, row.searchText)))
          .returning({ id: catalogEntries.id });
        written += updated.length;
      }
      if ((index + 1) % 20 === 0) process.stdout.write(`${index + 1}/${batches.length} requests\n`);
    }
    process.stdout.write(`done: ${written} vectors written\n`);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
