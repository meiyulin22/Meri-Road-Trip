/**
 * Bocha's Web Search API, which all three of Meri's searches run on: discovery,
 * official access evidence, and card images. One response carries both web pages
 * and images, so the three adapters differ only in which section they read and
 * what they shape it into. The endpoint, the request body and the envelope are
 * here so none of them can drift from the others again.
 */

const ENDPOINT = "https://api.bocha.cn/v1/web-search";
const TIMEOUT_MS = 30_000;

export type BochaWebSearchErrorKind =
  | "configuration" | "network" | "timeout" | "http" | "api" | "invalid_response";

export class BochaWebSearchError extends Error {
  constructor(readonly kind: BochaWebSearchErrorKind) {
    super(`Bocha web search ${kind}`);
    this.name = "BochaWebSearchError";
  }
}

export type BochaWebSearchRequest = {
  readonly apiKey: string;
  readonly query: string;
  /** Bocha accepts 1–50 and defaults to 10; each caller bounds its own results. */
  readonly count: number;
  /** Ask for the fuller page text in `summary` as well as the short `snippet`. */
  readonly summary: boolean;
  readonly fetcher?: typeof fetch;
};

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** A page timestamp read exactly as Bocha wrote it. */
export function bochaDate(value: unknown): string | undefined {
  const input = text(value);
  if (!input) return undefined;
  const parsed = new Date(input);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

/**
 * dateLastCrawled, which Bocha documents as the page's publish time in UTC+8 and
 * labels with a Z regardless. Read literally every page looks eight hours late,
 * and it is the only date many results carry, so both the access interpreter and
 * the candidate generator see it. Only the documented shape is corrected;
 * anything else is parsed as written.
 */
export function bochaCrawlDate(value: unknown): string | undefined {
  const input = text(value);
  if (!input) return undefined;
  return bochaDate(/T.*Z$/u.test(input) ? input.replace(/Z$/u, "+08:00") : input);
}

/**
 * No caller may narrow `freshness`. Bocha documents noLimit as both the default
 * and the recommendation, and warns that naming a window often matches no pages
 * at all — which would reach Meri as "no evidence about this place" rather than
 * "the question was asked too narrowly".
 */
export async function requestBochaWebSearch(request: BochaWebSearchRequest): Promise<unknown> {
  if (!request.apiKey.trim()) throw new BochaWebSearchError("configuration");
  let response: Response;
  try {
    response = await (request.fetcher ?? fetch)(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${request.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        query: request.query, freshness: "noLimit", summary: request.summary, count: request.count,
      }),
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    // Fetch errors may include the full URL (and key); expose only a fixed reason.
    throw new BochaWebSearchError(
      error instanceof Error && error.name === "TimeoutError" ? "timeout" : "network");
  }
  if (!response.ok) throw new BochaWebSearchError("http");
  try { return await response.json(); } catch { throw new BochaWebSearchError("invalid_response"); }
}

/**
 * `{ code, log_id, msg, data: { webPages: { value }, images: { value } } }`. A
 * missing section means the query matched nothing of that kind, which is an
 * empty result rather than a malformed response.
 */
export function bochaSearchValues(body: unknown, section: "webPages" | "images"): readonly unknown[] {
  const envelope = record(body);
  if (!envelope) throw new BochaWebSearchError("invalid_response");
  if (envelope.code !== 200 && envelope.code !== 0) throw new BochaWebSearchError("api");
  const data = record(envelope.data);
  if (!data) throw new BochaWebSearchError("invalid_response");
  const value = record(data[section])?.value;
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new BochaWebSearchError("invalid_response");
  return value;
}
