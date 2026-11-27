import { basename } from "node:path";

import { type SummaryEnrichment, summaryEnrichmentSchema, summaryFingerprint } from "@/domain/catalog/catalog-enrichment";
import { catalogEntrySchema } from "@/domain/catalog/catalog-entry";
import { type CatalogRow, toCatalogRow } from "@/domain/catalog/catalog-row";

/** One city file of the private catalog: data/cities/<省>-<州/市>.ndjson. */
export type CatalogFile = { readonly path: string; readonly text: string };

export type CatalogRead = {
  readonly rows: readonly CatalogRow[];
  /** Any problem stops the import before it writes a row. */
  readonly problems: readonly string[];
  /** Worth reading, not worth stopping for. */
  readonly warnings: readonly string[];
  /** How many summaries came from the enrichment file. */
  readonly enriched: number;
};

/** The enrichment file (data/enrichment/summaries.ndjson); null when the catalog has none. */
export type EnrichmentFile = CatalogFile;

type Enrichments = {
  readonly byId: ReadonlyMap<string, SummaryEnrichment>;
  readonly used: Set<string>;
};

function readEnrichment(file: EnrichmentFile | null, problems: string[]): Enrichments {
  const byId = new Map<string, SummaryEnrichment>();
  if (!file) {
    return { byId, used: new Set() };
  }
  file.text.split("\n").forEach((line, index) => {
    if (line.trim().length === 0) {
      return;
    }
    const at = `${basename(file.path)}:${index + 1}`;
    let json: unknown;
    try {
      json = JSON.parse(line);
    } catch (error) {
      problems.push(`${at}: not JSON (${error instanceof Error ? error.message : String(error)})`);
      return;
    }
    const parsed = summaryEnrichmentSchema.safeParse(json);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((issue) => `${issue.path.join(".") || "(root)"} ${issue.message}`);
      problems.push(`${at}: ${issues.join("; ")}`);
      return;
    }
    if (byId.has(parsed.data.id)) {
      problems.push(`${at}: ${parsed.data.id} is enriched more than once`);
      return;
    }
    byId.set(parsed.data.id, parsed.data);
  });
  return { byId, used: new Set() };
}

function expectedLocation(path: string): { province: string; prefecture: string } | null {
  const [province, prefecture, ...rest] = basename(path, ".ndjson").split("-");
  return province && prefecture && rest.length === 0 ? { province, prefecture } : null;
}

function readFile(file: CatalogFile, enrichments: Enrichments, rows: CatalogRow[], problems: string[], warnings: string[]): void {
  const expected = expectedLocation(file.path);
  if (!expected) {
    problems.push(`${file.path}: the name is not <省>-<州或市>.ndjson`);
    return;
  }

  file.text.split("\n").forEach((line, index) => {
    if (line.trim().length === 0) {
      return;
    }
    const at = `${basename(file.path)}:${index + 1}`;
    let json: unknown;
    try {
      json = JSON.parse(line);
    } catch (error) {
      problems.push(`${at}: not JSON (${error instanceof Error ? error.message : String(error)})`);
      return;
    }

    const parsed = catalogEntrySchema.safeParse(json);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((issue) => `${issue.path.join(".") || "(root)"} ${issue.message}`);
      problems.push(`${at}: ${issues.join("; ")}`);
      return;
    }

    const { location } = parsed.data;
    if (location.province !== expected.province || location.prefecture !== expected.prefecture) {
      problems.push(`${at}: ${parsed.data.id} is in ${location.province}-${location.prefecture}, not in this file's city`);
      return;
    }

    const enrichment = enrichments.byId.get(parsed.data.id);
    let entry = parsed.data;
    if (enrichment) {
      enrichments.used.add(enrichment.id);
      if (enrichment.based_on === summaryFingerprint(entry.summary)) {
        entry = { ...entry, summary: enrichment.value };
      } else {
        warnings.push(`${entry.id}: the enriched summary was written for an older summary; the catalog's own is kept`);
      }
    }

    const converted = toCatalogRow(entry);
    if (!converted.ok) {
      problems.push(`${at}: ${parsed.data.id} has tags the mapping does not know: ${converted.unknownTags.join("、")}`);
      return;
    }
    rows.push(converted.row);
  });
}

/**
 * Validates every line of every file and turns it into a table row; writes nothing. A summary in the
 * enrichment file replaces the catalog's own when it was written for that same summary.
 */
export function readCatalog(files: readonly CatalogFile[], enrichmentFile: EnrichmentFile | null = null): CatalogRead {
  const rows: CatalogRow[] = [];
  const problems: string[] = [];
  const warnings: string[] = [];
  const enrichments = readEnrichment(enrichmentFile, problems);

  if (files.length === 0) {
    problems.push("no city files found");
  }
  for (const file of files) {
    readFile(file, enrichments, rows, problems, warnings);
  }

  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.id)) {
      problems.push(`${row.id} appears more than once`);
    }
    seen.add(row.id);
  }

  for (const row of rows) {
    for (const link of row.related) {
      if (!seen.has(link.id)) {
        warnings.push(`${row.id} is related to ${link.id}, which is not in the catalog`);
      }
    }
  }

  for (const id of enrichments.byId.keys()) {
    if (!enrichments.used.has(id)) {
      warnings.push(`${id} is enriched but not in the catalog`);
    }
  }

  const enriched = rows.filter((row) => enrichments.byId.get(row.id)?.value === row.summary).length;
  return { rows, problems, warnings, enriched };
}

export type ImportCounts = { readonly added: number; readonly updated: number; readonly removed: number };

/** How the table changes when these rows replace what it holds now. */
export function countChanges(existingIds: ReadonlySet<string>, rows: readonly CatalogRow[]): ImportCounts {
  const incoming = new Set(rows.map((row) => row.id));
  const added = rows.filter((row) => !existingIds.has(row.id)).length;
  const removed = [...existingIds].filter((id) => !incoming.has(id)).length;
  return { added, updated: rows.length - added, removed };
}
