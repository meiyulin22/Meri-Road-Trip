import type { OfficialAccessSearch, OfficialAccessSearchResult } from "@/server/location/official-access-search";

const ENDPOINT = "https://api.bocha.cn/v1/ai-search";
const RESULT_COUNT = 8;
const TIMEOUT_MS = 30_000;

export class BochaAccessSearchError extends Error {
  constructor(readonly kind: "configuration" | "network" | "http" | "api" | "invalid_response") {
    super(`Bocha access search ${kind}`);
  }
}

type Options = { readonly apiKey: string; readonly fetcher?: typeof fetch };

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function date(value: unknown): string | undefined {
  const input = text(value);
  if (!input) return undefined;
  const parsed = new Date(input);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function normalizePage(value: unknown): OfficialAccessSearchResult | null {
  const page = record(value);
  if (!page) return null;
  const title = text(page.name) ?? text(page.title);
  const urlText = text(page.url);
  if (!title || !urlText) return null;
  let url: URL;
  try { url = new URL(urlText); } catch { return null; }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const snippet = text(page.snippet) ?? text(page.summary) ?? "";
  const summary = text(page.summary);
  const publishedAt = date(page.datePublished ?? page.publishedAt);
  const lastCrawledAt = date(page.dateLastCrawled ?? page.lastCrawledAt);
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
  const body = record(value);
  if (!body) throw new BochaAccessSearchError("invalid_response");
  if (body.code !== 200 && body.code !== 0) throw new BochaAccessSearchError("api");
  const messages = body.messages ?? record(body.data)?.messages;
  if (!Array.isArray(messages)) throw new BochaAccessSearchError("invalid_response");
  const results: OfficialAccessSearchResult[] = [];
  const urls = new Set<string>();
  for (const rawMessage of messages) {
    const message = record(rawMessage);
    if (message?.type !== "source" || message.content_type !== "webpage") continue;
    let content: unknown = message.content;
    if (typeof content === "string") {
      try { content = JSON.parse(content); } catch { throw new BochaAccessSearchError("invalid_response"); }
    }
    const pages = record(content)?.value;
    if (!Array.isArray(pages)) throw new BochaAccessSearchError("invalid_response");
    for (const rawPage of pages) {
      const page = normalizePage(rawPage);
      if (!page || urls.has(page.url)) continue;
      urls.add(page.url);
      results.push(page);
      if (results.length >= RESULT_COUNT) return results;
    }
  }
  return results;
}

export class BochaOfficialAccessSearch implements OfficialAccessSearch {
  constructor(private readonly options: Options) {}

  async search(query: string): Promise<readonly OfficialAccessSearchResult[]> {
    if (!this.options.apiKey.trim()) throw new BochaAccessSearchError("configuration");
    let response: Response;
    try {
      response = await (this.options.fetcher ?? fetch)(ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.options.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query, answer: false, stream: false, count: RESULT_COUNT, freshness: "oneYear" }),
        redirect: "error",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch { throw new BochaAccessSearchError("network"); }
    if (!response.ok) throw new BochaAccessSearchError("http");
    let body: unknown;
    try { body = await response.json(); } catch { throw new BochaAccessSearchError("invalid_response"); }
    return normalizeBochaAccessResponse(body);
  }
}

export function createBochaOfficialAccessSearchFromEnvironment(): OfficialAccessSearch {
  return new BochaOfficialAccessSearch({ apiKey: process.env.BOCHA_API_KEY?.trim() ?? "" });
}
