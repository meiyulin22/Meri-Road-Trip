/** One row still to embed: its id and the text its vector must describe. */
export type PendingEmbedding = { readonly id: string; readonly searchText: string };

/** Rows in requests of at most `size` texts, in the order given. */
export function embeddingBatches(rows: readonly PendingEmbedding[], size: number): PendingEmbedding[][] {
  if (!Number.isInteger(size) || size < 1) throw new Error(`Batch size must be a positive whole number, got ${size}.`);
  const batches: PendingEmbedding[][] = [];
  for (let start = 0; start < rows.length; start += size) batches.push(rows.slice(start, start + size));
  return batches;
}
