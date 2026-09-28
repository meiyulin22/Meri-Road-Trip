import type { DestinationImageSearch, DestinationImageSearchResult } from "@/platform/search/destination-image-search";

const ENDPOINT = "https://api.bocha.cn/v1/ai-search";
const RESULT_COUNT = 8;
const TIMEOUT_MS = 30_000;

export class BochaImageSearchError extends Error {
  constructor(readonly kind: "configuration" | "network" | "http" | "api" | "invalid_response") {
    super(`Bocha image search ${kind}`);
  }
}

type Options = { readonly apiKey: string; readonly fetcher?: typeof fetch };

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function dimension(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function image(value: unknown): DestinationImageSearchResult | null {
  const item = record(value);
  if (!item || typeof item.contentUrl !== "string" || typeof item.hostPageUrl !== "string") return null;
  if ((item.width !== undefined && dimension(item.width) === undefined)
    || (item.height !== undefined && dimension(item.height) === undefined)) return null;
  const contentUrl = item.contentUrl.trim();
  const hostPageUrl = item.hostPageUrl.trim();
  if (!contentUrl || !hostPageUrl) return null;
  const width = dimension(item.width);
  const height = dimension(item.height);
  return { contentUrl, hostPageUrl, ...(width ? { width } : {}), ...(height ? { height } : {}) };
}

export function normalizeBochaImageResponse(value: unknown): readonly DestinationImageSearchResult[] {
  const body = record(value);
  if (!body) throw new BochaImageSearchError("invalid_response");
  if (body.code !== 200 && body.code !== 0) throw new BochaImageSearchError("api");
  const messages = body.messages ?? record(body.data)?.messages;
  if (!Array.isArray(messages)) throw new BochaImageSearchError("invalid_response");
  const results: DestinationImageSearchResult[] = [];
  const seen = new Set<string>();
  for (const rawMessage of messages) {
    const message = record(rawMessage);
    if (message?.type !== "source" || message.content_type !== "image") continue;
    let content: unknown = message.content;
    if (typeof content === "string") {
      try { content = JSON.parse(content); } catch { throw new BochaImageSearchError("invalid_response"); }
    }
    const items = record(content)?.value;
    if (!Array.isArray(items)) throw new BochaImageSearchError("invalid_response");
    for (const raw of items) {
      const normalized = image(raw);
      if (!normalized || seen.has(normalized.contentUrl)) continue;
      results.push(normalized);
      seen.add(normalized.contentUrl);
      if (results.length >= RESULT_COUNT) return results;
    }
  }
  return results;
}

export class BochaDestinationImageSearch implements DestinationImageSearch {
  constructor(private readonly options: Options) {}

  async search(query: string): Promise<readonly DestinationImageSearchResult[]> {
    if (!this.options.apiKey.trim()) throw new BochaImageSearchError("configuration");
    let response: Response;
    try {
      response = await (this.options.fetcher ?? fetch)(ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.options.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query, answer: false, stream: false, count: RESULT_COUNT, freshness: "noLimit" }),
        redirect: "error",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch { throw new BochaImageSearchError("network"); }
    if (!response.ok) throw new BochaImageSearchError("http");
    let body: unknown;
    try { body = await response.json(); } catch { throw new BochaImageSearchError("invalid_response"); }
    return normalizeBochaImageResponse(body);
  }
}

export function createBochaDestinationImageSearchFromEnvironment(): DestinationImageSearch {
  return new BochaDestinationImageSearch({ apiKey: process.env.BOCHA_API_KEY?.trim() ?? "" });
}
