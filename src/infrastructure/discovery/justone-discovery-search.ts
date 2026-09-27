import { DiscoverySearchError, type DiscoverySearch, type DiscoverySearchResult } from "@/server/discovery/discovery-search";

const ENDPOINT = "https://api.justoneapi.com/api/search/v1";
const TIMEOUT_MS = 120_000;
const MAX_RESULTS = 8;
const LOOKBACK_DAYS = 30;

type JustOneDiscoveryOptions = {
  readonly token: string;
  readonly fetcher?: typeof fetch;
  readonly now?: () => Date;
};

function chinaDateTime(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const fields = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${fields.year}-${fields.month}-${fields.day} ${fields.hour}:${fields.minute}:${fields.second}`;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function presentText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function snippetFromHtml(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, " ")
    .replace(/<[^>]*>/gu, " ").replace(/\s+/gu, " ").trim();
  return text ? text.slice(0, 280) : null;
}

function normalizeItem(value: unknown): DiscoverySearchResult | null {
  const item = record(value);
  if (!item) return null;
  const source = presentText(item.sourceName);
  const title = presentText(item.title);
  const urlText = presentText(item.url);
  if (!source || !title || !urlText) return null;
  let url: URL;
  try { url = new URL(urlText); } catch { return null; }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const snippet = snippetFromHtml(item.content);
  const timestamp = typeof item.createTime === "number" ? item.createTime : NaN;
  const publishedAt = Number.isFinite(timestamp) && !Number.isNaN(new Date(timestamp).getTime())
    ? new Date(timestamp).toISOString() : null;
  return { source, title: title.slice(0, 160), url: url.toString(),
    ...(snippet ? { snippet } : {}), ...(publishedAt ? { publishedAt } : {}) };
}

export function normalizeJustOneSearchResponse(value: unknown): readonly DiscoverySearchResult[] {
  const response = record(value);
  if (!response || typeof response.code !== "number") throw new DiscoverySearchError("invalid_response");
  if (response.code !== 0) throw new DiscoverySearchError("api");
  const data = record(response.data);
  if (!data || !Array.isArray(data.list)) throw new DiscoverySearchError("invalid_response");
  const results: DiscoverySearchResult[] = [];
  const urls = new Set<string>();
  for (const raw of data.list) {
    const item = normalizeItem(raw);
    if (!item || urls.has(item.url)) continue;
    urls.add(item.url);
    results.push(item);
    if (results.length === MAX_RESULTS) break;
  }
  return results;
}

export class JustOneDiscoverySearch implements DiscoverySearch {
  private readonly fetcher: typeof fetch;
  private readonly now: () => Date;

  constructor(private readonly options: JustOneDiscoveryOptions) {
    this.fetcher = options.fetcher ?? fetch;
    this.now = options.now ?? (() => new Date());
  }

  async search(query: string): Promise<readonly DiscoverySearchResult[]> {
    if (!this.options.token.trim()) throw new DiscoverySearchError("configuration");
    const end = this.now();
    const start = new Date(end.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1_000);
    const url = new URL(ENDPOINT);
    url.searchParams.set("token", this.options.token);
    url.searchParams.set("keyword", query);
    url.searchParams.set("source", "ALL");
    url.searchParams.set("start", chinaDateTime(start));
    url.searchParams.set("end", chinaDateTime(end));
    let response: Response;
    try {
      response = await this.fetcher(url, { method: "GET", redirect: "error", signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (error) {
      throw new DiscoverySearchError(error instanceof Error && error.name === "TimeoutError" ? "timeout" : "network");
    }
    if (!response.ok) throw new DiscoverySearchError("http");
    let body: unknown;
    try { body = await response.json(); } catch { throw new DiscoverySearchError("invalid_response"); }
    return normalizeJustOneSearchResponse(body);
  }
}

export function createJustOneDiscoverySearchFromEnvironment(): DiscoverySearch {
  return new JustOneDiscoverySearch({ token: process.env.JUSTONEAPI_TOKEN?.trim() ?? "" });
}
