import type { CatalogEntry, CatalogKind } from "./catalog-entry";
import { type CatalogTag, normaliseCatalogTags } from "./catalog-tags";

const kindWords: Record<CatalogKind, string> = {
  spot: "景点",
  dish: "特色菜",
  restaurant: "餐馆",
  stay: "住宿",
  transport: "交通",
  tip: "旅行提示",
};

/** What one catalog entry becomes in the catalog_entries table, before the import adds its version and time. */
export type CatalogRow = {
  readonly id: string;
  readonly kind: CatalogKind;
  readonly name: string;
  readonly aliases: readonly string[];
  /** Aliases joined by spaces: pg_trgm cannot index an array, so names are matched on this. */
  readonly aliasesText: string;
  readonly province: string;
  readonly prefecture: string;
  readonly county: string | null;
  readonly summary: string;
  readonly tags: readonly CatalogTag[];
  readonly tagsRaw: readonly string[];
  readonly details: CatalogEntry["details"];
  readonly related: CatalogEntry["related"];
  readonly historical: CatalogEntry["historical"];
  readonly sourceRefs: CatalogEntry["source_refs"];
  readonly confidence: CatalogEntry["confidence"];
  readonly sourceCount: number;
  readonly searchText: string;
};

export type CatalogRowResult =
  | { readonly ok: true; readonly row: CatalogRow }
  | { readonly ok: false; readonly unknownTags: readonly string[] };

/** The text later matched by words and embedded: names, kind, fixed tags, summary and highlights. */
export function buildSearchText(entry: CatalogEntry, tags: readonly CatalogTag[]): string {
  const highlights = entry.kind === "spot" ? entry.details.highlights : [];
  return [entry.name, ...entry.aliases, kindWords[entry.kind], ...tags, entry.summary, ...highlights]
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join(" ");
}

export function toCatalogRow(entry: CatalogEntry): CatalogRowResult {
  const normalised = normaliseCatalogTags(entry);
  if (!normalised.ok) {
    return normalised;
  }

  return {
    ok: true,
    row: {
      id: entry.id,
      kind: entry.kind,
      name: entry.name,
      aliases: entry.aliases,
      aliasesText: entry.aliases.join(" "),
      province: entry.location.province,
      prefecture: entry.location.prefecture,
      county: entry.location.county,
      summary: entry.summary,
      tags: normalised.tags,
      tagsRaw: entry.tags,
      details: entry.details,
      related: entry.related,
      historical: entry.historical,
      sourceRefs: entry.source_refs,
      confidence: entry.confidence,
      sourceCount: entry.source_refs.length,
      searchText: buildSearchText(entry, normalised.tags),
    },
  };
}
