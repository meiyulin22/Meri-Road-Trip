import type { OfficialAccessSearch, OfficialAccessSearchResult } from "@/platform/search/official-access-search";
import { bochaCrawlDate, bochaDate, bochaSearchValues, requestBochaWebSearch } from "./bocha-web-search";

const RESULT_COUNT = 8;

type Options = { readonly apiKey: string; readonly fetcher?: typeof fetch };

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizePage(value: unknown): OfficialAccessSearchResult | null {
  const page = record(value);
  if (!page) return null;
  const title = text(page.name);
  const urlText = text(page.url);
  if (!title || !urlText) return null;
  let url: URL;
  try { url = new URL(urlText); } catch { return null; }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const snippet = text(page.snippet) ?? text(page.summary) ?? "";
  const summary = text(page.summary);
  // Bocha says dateLastCrawled is the publish time, so it is the better fallback
  // than leaving the interpreter with no date for this page at all.
  const lastCrawledAt = bochaCrawlDate(page.dateLastCrawled);
  const publishedAt = bochaDate(page.datePublished) ?? lastCrawledAt;
  return {
    title: title.slice(0, 200), url: url.toString(),
    siteName: (text(page.siteName) ?? url.hostname).slice(0, 120),
    snippet: snippet.slice(0, 600),
    ...(summary ? { summary: summary.slice(0, 600) } : {}),
    ...(publishedAt ? { publishedAt } : {}),
    ...(lastCrawledAt ? { lastCrawledAt } : {}),
  };
}

export function normalizeBochaAccessResponse(value: unknown): readonly OfficialAccessSearchResult[] {
  const results: OfficialAccessSearchResult[] = [];
  const urls = new Set<string>();
  for (const raw of bochaSearchValues(value, "webPages")) {
    const page = normalizePage(raw);
    if (!page || urls.has(page.url)) continue;
    urls.add(page.url);
    results.push(page);
    if (results.length >= RESULT_COUNT) break;
  }
  return results;
}

export class BochaOfficialAccessSearch implements OfficialAccessSearch {
  constructor(private readonly options: Options) {}

  async search(query: string): Promise<readonly OfficialAccessSearchResult[]> {
    // An access notice is judged on what it says, so the fuller summary text is
    // worth asking for rather than the short snippet alone.
    return normalizeBochaAccessResponse(await requestBochaWebSearch({
      apiKey: this.options.apiKey, query, count: RESULT_COUNT, summary: true,
      ...(this.options.fetcher ? { fetcher: this.options.fetcher } : {}),
    }));
  }
}

export function createBochaOfficialAccessSearchFromEnvironment(): OfficialAccessSearch {
  return new BochaOfficialAccessSearch({ apiKey: process.env.BOCHA_API_KEY?.trim() ?? "" });
}
