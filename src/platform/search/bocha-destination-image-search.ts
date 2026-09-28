import type { DestinationImageSearch, DestinationImageSearchResult } from "@/platform/search/destination-image-search";
import { bochaSearchValues, requestBochaWebSearch } from "./bocha-web-search";

const RESULT_COUNT = 8;

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
  const results: DestinationImageSearchResult[] = [];
  const seen = new Set<string>();
  for (const raw of bochaSearchValues(value, "images")) {
    const normalized = image(raw);
    if (!normalized || seen.has(normalized.contentUrl)) continue;
    results.push(normalized);
    seen.add(normalized.contentUrl);
    if (results.length >= RESULT_COUNT) break;
  }
  return results;
}

export class BochaDestinationImageSearch implements DestinationImageSearch {
  constructor(private readonly options: Options) {}

  async search(query: string): Promise<readonly DestinationImageSearchResult[]> {
    // Only the image section is read, so the fuller page text would be paid for
    // and thrown away.
    return normalizeBochaImageResponse(await requestBochaWebSearch({
      apiKey: this.options.apiKey, query, count: RESULT_COUNT, summary: false,
      ...(this.options.fetcher ? { fetcher: this.options.fetcher } : {}),
    }));
  }
}

export function createBochaDestinationImageSearchFromEnvironment(): DestinationImageSearch {
  return new BochaDestinationImageSearch({ apiKey: process.env.BOCHA_API_KEY?.trim() ?? "" });
}
