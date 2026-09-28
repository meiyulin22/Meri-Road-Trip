import { DiscoverySearchError, type DiscoverySearch, type DiscoverySearchResult } from "@/platform/search/discovery-search";
import {
  BochaWebSearchError, bochaCrawlDate, bochaDate, bochaSearchValues, requestBochaWebSearch,
} from "./bocha-web-search";

const MAX_RESULTS = 8;
const MAX_TITLE_CHARACTERS = 160;
const MAX_SNIPPET_CHARACTERS = 280;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizePage(value: unknown): DiscoverySearchResult | null {
  const page = record(value);
  if (!page) return null;
  const title = text(page.name);
  const urlText = text(page.url);
  if (!title || !urlText) return null;
  let url: URL;
  try { url = new URL(urlText); } catch { return null; }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  // The request asks for summary, so the fuller text is what a candidate can
  // actually be inspired by; snippet is what a page without one still offers.
  const snippet = text(page.summary) ?? text(page.snippet);
  const publishedAt = bochaDate(page.datePublished) ?? bochaCrawlDate(page.dateLastCrawled);
  return {
    source: (text(page.siteName) ?? url.hostname).slice(0, 120),
    title: title.slice(0, MAX_TITLE_CHARACTERS),
    url: url.toString(),
    ...(snippet ? { snippet: snippet.slice(0, MAX_SNIPPET_CHARACTERS) } : {}),
    ...(publishedAt ? { publishedAt } : {}),
  };
}

export function normalizeBochaDiscoveryResponse(value: unknown): readonly DiscoverySearchResult[] {
  const results: DiscoverySearchResult[] = [];
  const urls = new Set<string>();
  for (const raw of bochaSearchValues(value, "webPages")) {
    const page = normalizePage(raw);
    if (!page || urls.has(page.url)) continue;
    urls.add(page.url);
    results.push(page);
    if (results.length >= MAX_RESULTS) break;
  }
  return results;
}

/**
 * Discovery is what recent travel writing happens to be saying, offered to the
 * candidate generator as inspiration and never as proof. It replaced JustOne,
 * whose only distinguishing feature was a 30-day window that Bocha advises
 * against asking for, and which cost up to 120 seconds to answer.
 */
export class BochaDiscoverySearch implements DiscoverySearch {
  constructor(private readonly options: { readonly apiKey: string; readonly fetcher?: typeof fetch }) {}

  async search(query: string): Promise<readonly DiscoverySearchResult[]> {
    try {
      return normalizeBochaDiscoveryResponse(await requestBochaWebSearch({
        apiKey: this.options.apiKey, query, count: MAX_RESULTS, summary: true,
        ...(this.options.fetcher ? { fetcher: this.options.fetcher } : {}),
      }));
    } catch (error) {
      // Both errors name the same failure kinds and neither one ever carries the
      // provider's own message, which can hold the key.
      throw new DiscoverySearchError(
        error instanceof BochaWebSearchError ? error.kind : "invalid_response");
    }
  }
}

export function createBochaDiscoverySearchFromEnvironment(): DiscoverySearch {
  return new BochaDiscoverySearch({ apiKey: process.env.BOCHA_API_KEY?.trim() ?? "" });
}
