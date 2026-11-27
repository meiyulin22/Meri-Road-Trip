import { createHash } from "node:crypto";

import { z } from "zod";

import { maxSummaryLength } from "./summary-voice";

/**
 * A summary rewritten in Meri's voice, kept apart from the catalog's own files (meri-catalog-cn
 * data/enrichment/summaries.ndjson, one line each) and merged at import. `based_on` fingerprints the
 * summary it replaces: if the catalog's summary changes later, the old rewrite no longer applies.
 */
export const summaryEnrichmentSchema = z.strictObject({
  id: z.string().regex(/^[a-z][a-z0-9_]*$/),
  field: z.literal("summary"),
  value: z.string().min(1).max(maxSummaryLength),
  based_on: z.string().regex(/^[0-9a-f]{16}$/),
  source: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type SummaryEnrichment = z.infer<typeof summaryEnrichmentSchema>;

/** The first 16 hex characters of the text's SHA-256. */
export function summaryFingerprint(summary: string): string {
  return createHash("sha256").update(summary, "utf8").digest("hex").slice(0, 16);
}
