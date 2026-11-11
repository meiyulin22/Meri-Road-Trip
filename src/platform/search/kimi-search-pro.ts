import { z } from "zod";

import { DEFAULT_MOONSHOT_BASE_URL } from "@/platform/llm/moonshot-chat-model";
import { DiscoverySearchError, type DiscoverySearch, type DiscoverySearchResult } from "./discovery-search";

const MAX_RESULTS = 5;
const MAX_QUERY_CHARACTERS = 160;
const MAX_SNIPPET_CHARACTERS = 560;
const SEARCH_TIMEOUT_SECONDS = 10;
const REQUEST_TIMEOUT_MS = 12_000;

const responseSchema = z.object({ search_results: z.array(z.unknown()) });
const pageSchema = z.object({
  title: z.string().trim().min(1),
  url: z.string().trim().max(2048),
  site_name: z.unknown().optional(),
  snippet: z.unknown().optional(),
  date: z.unknown().optional(),
  chunks: z.unknown().optional(),
});
const chunkSchema = z.object({ text: z.string().trim().min(1) });
const dateSchema = z.iso.date();
const timestampSchema = z.iso.datetime({ offset: true });

function nonemptyText(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim() || undefined : undefined;
}

function httpUrl(value: string): URL | undefined {
  try {
    const url = new URL(value);
    if (["http:", "https:"].includes(url.protocol) && !url.username && !url.password) return url;
  } catch {
    return undefined;
  }
  return undefined;
}

function publishedDate(value: unknown): string | undefined {
  const date = nonemptyText(value);
  if (!date) return undefined;
  if (dateSchema.safeParse(date).success || timestampSchema.safeParse(date).success) return date;
  return undefined;
}

function evidenceExcerpt(chunks: unknown, snippet: unknown): string | undefined {
  const excerpts = [];
  if (Array.isArray(chunks)) {
    for (const raw of chunks.slice(0, 2)) {
      const chunk = chunkSchema.safeParse(raw);
      if (chunk.success) excerpts.push(chunk.data.text.slice(0, MAX_SNIPPET_CHARACTERS / 2));
    }
  }
  return excerpts.length ? excerpts.join("\n").slice(0, MAX_SNIPPET_CHARACTERS) :
    nonemptyText(snippet)?.slice(0, MAX_SNIPPET_CHARACTERS);
}

function normalizeResponse(raw: unknown): readonly DiscoverySearchResult[] {
  const parsed = responseSchema.safeParse(raw);
  if (!parsed.success) throw new DiscoverySearchError("invalid_response");
  const results: DiscoverySearchResult[] = [];
  const urls = new Set<string>();
  for (const rawPage of parsed.data.search_results) {
    const page = pageSchema.safeParse(rawPage);
    if (!page.success) continue;
    const url = httpUrl(page.data.url);
    if (!url || urls.has(url.href)) continue;
    urls.add(url.href);

    const snippet = evidenceExcerpt(page.data.chunks, page.data.snippet);
    const publishedAt = publishedDate(page.data.date);
    results.push({
      source: (nonemptyText(page.data.site_name) ?? url.hostname).slice(0, 120),
      title: page.data.title.slice(0, 160),
      url: url.href,
      ...(snippet ? { snippet } : {}),
      ...(publishedAt ? { publishedAt } : {}),
    });
    if (results.length === MAX_RESULTS) break;
  }
  return results;
}

export class KimiSearchPro implements DiscoverySearch {
  constructor(private readonly options: {
    readonly apiKey: string;
    readonly baseUrl?: string;
    readonly fetcher?: typeof fetch;
  }) {}

  async search(query: string, signal?: AbortSignal): Promise<readonly DiscoverySearchResult[]> {
    const apiKey = this.options.apiKey.trim();
    const baseUrl = httpUrl(this.options.baseUrl ?? DEFAULT_MOONSHOT_BASE_URL);
    if (!apiKey || !baseUrl || baseUrl.search || baseUrl.hash) throw new DiscoverySearchError("configuration");

    const searchQuery = query.replace(/\s+/gu, " ").trim().slice(0, MAX_QUERY_CHARACTERS).trimEnd();
    if (!searchQuery) return [];
    if (signal?.aborted) throw new DiscoverySearchError("network");

    const endpoint = baseUrl.href.replace(/\/+$/u, "") + "/tools/search_pro";
    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    let response: Response;
    try {
      response = await (this.options.fetcher ?? fetch)(endpoint, {
        method: "POST",
        headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ text_query: searchQuery, limit: MAX_RESULTS, timeout_seconds: SEARCH_TIMEOUT_SECONDS }),
        cache: "no-store",
        redirect: "error",
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
    } catch {
      // Fetch failures can contain credentials supplied by the configured endpoint.
      throw new DiscoverySearchError(timeout.aborted ? "timeout" : "network");
    }
    if (!response.ok) throw new DiscoverySearchError(response.status === 504 ? "timeout" : "http");

    let raw: unknown;
    try {
      raw = await response.json();
    } catch {
      throw new DiscoverySearchError(timeout.aborted ? "timeout" : "invalid_response");
    }
    return normalizeResponse(raw);
  }
}

export function createKimiSearchProFromEnvironment(): KimiSearchPro {
  return new KimiSearchPro({
    apiKey: process.env.MOONSHOT_API_KEY ?? "",
    baseUrl: process.env.MOONSHOT_BASE_URL?.trim() || DEFAULT_MOONSHOT_BASE_URL,
  });
}
