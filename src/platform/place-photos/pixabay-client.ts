import type { PixabayHit } from "./pixabay-photo-match";

/**
 * Pixabay's search API and its image CDN, one request at a time. Every failure is named
 * so the caller can tell "there is nothing" (an answer, cached) from "we could not ask"
 * (not cached, not final), and the API key never leaves this file: errors carry a
 * status, never a URL.
 *
 * Terms (2026-10-23): 100 requests per 60 seconds; search answers must be cached for
 * 24 hours; images may not be hotlinked permanently — `webformatURL` expires after 24
 * hours — so a photo Meri shows is downloaded and served from Meri's own storage.
 * Pixabay is reached through the server's own network; in development behind a proxy,
 * run with NODE_USE_ENV_PROXY=1 as the Tianditu launch configuration does.
 */
export type PixabayFailure =
  /** 400/401/403: the key is wrong or refused. Asking again will not help. */
  | "refused"
  | "rate_limited"
  /** Network, timeout, 5xx, a full queue or an unreadable answer: try again later. */
  | "transient";

export type SearchOutcome =
  | { readonly ok: true; readonly hits: readonly PixabayHit[] }
  | { readonly ok: false; readonly failure: PixabayFailure };

export type DownloadOutcome =
  | { readonly ok: true; readonly body: Uint8Array; readonly contentType: string }
  /** "unsuitable": this file will never do — wrong host, not an image, too large, gone. */
  | { readonly ok: false; readonly failure: PixabayFailure | "unsuitable" };

export interface PixabayClientOptions {
  readonly key: string;
  readonly fetcher?: typeof fetch;
  readonly maxQueue?: number;
  readonly searchTimeoutMs?: number;
  readonly downloadTimeoutMs?: number;
  readonly maxDownloadBytes?: number;
}

const apiUrl = "https://pixabay.com/api/";
const downloadHosts = new Set(["cdn.pixabay.com", "pixabay.com"]);
const maxRedirects = 2;

function isHit(value: unknown): value is PixabayHit {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const hit = value as Record<string, unknown>;
  return typeof hit.id === "number" && Number.isSafeInteger(hit.id) && hit.id > 0 &&
    typeof hit.tags === "string" && hit.tags.length <= 1000 && typeof hit.pageURL === "string" &&
    typeof hit.webformatURL === "string" && typeof hit.user === "string" && hit.user.length <= 100 &&
    typeof hit.imageWidth === "number" && Number.isFinite(hit.imageWidth) && hit.imageWidth > 0 &&
    typeof hit.imageHeight === "number" && Number.isFinite(hit.imageHeight) && hit.imageHeight > 0;
}

/** Only what Meri reads is kept, so the 24-hour cache holds no more than it needs. */
function trimmed(hit: PixabayHit): PixabayHit {
  const { id, tags, pageURL, webformatURL, imageWidth, imageHeight, user } = hit;
  return { id, tags, pageURL, webformatURL, imageWidth, imageHeight, user };
}

function allowedDownload(url: string): URL | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && downloadHosts.has(parsed.hostname) && !parsed.username && !parsed.password
      ? parsed : null;
  } catch {
    return null;
  }
}

export class PixabayClient {
  private readonly fetcher: typeof fetch;
  private readonly maxQueue: number;
  private readonly searchTimeoutMs: number;
  private readonly downloadTimeoutMs: number;
  private readonly maxDownloadBytes: number;
  private running = false;
  private readonly waiting: (() => void)[] = [];

  constructor(private readonly options: PixabayClientOptions) {
    this.fetcher = options.fetcher ?? fetch;
    this.maxQueue = options.maxQueue ?? 16;
    this.searchTimeoutMs = options.searchTimeoutMs ?? 8_000;
    this.downloadTimeoutMs = options.downloadTimeoutMs ?? 15_000;
    this.maxDownloadBytes = options.maxDownloadBytes ?? 4 * 1024 * 1024;
  }

  /** `parameters` is the search without the key; the key is added here and nowhere else. */
  async search(parameters: URLSearchParams): Promise<SearchOutcome> {
    const url = new URL(apiUrl);
    url.search = parameters.toString();
    url.searchParams.set("key", this.options.key);
    return this.inTurn(async (): Promise<SearchOutcome> => {
      let response: Response;
      try {
        response = await this.fetcher(url, { signal: AbortSignal.timeout(this.searchTimeoutMs), redirect: "error" });
      } catch {
        return { ok: false, failure: "transient" };
      }
      if (response.status === 429) return { ok: false, failure: "rate_limited" };
      // Pixabay answers a missing or invalid key with 400; the search itself is always well-formed.
      if ([400, 401, 403].includes(response.status)) return { ok: false, failure: "refused" };
      if (!response.ok) return { ok: false, failure: "transient" };
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        return { ok: false, failure: "transient" };
      }
      const hits = typeof body === "object" && body !== null ? (body as { hits?: unknown }).hits : undefined;
      if (!Array.isArray(hits) || hits.length > 200) return { ok: false, failure: "transient" };
      // One odd hit is dropped on its own: a 511-character tag list once failed the whole
      // answer for 元阳梯田, and a failed answer is asked for again on every visit.
      return { ok: true, hits: hits.filter(isHit).map(trimmed) };
    }, { ok: false, failure: "transient" });
  }

  /** One image from Pixabay's own hosts, following at most two redirects that stay on them. */
  async download(address: string): Promise<DownloadOutcome> {
    return this.inTurn(async (): Promise<DownloadOutcome> => {
      let url = allowedDownload(address);
      const signal = AbortSignal.timeout(this.downloadTimeoutMs);
      for (let hop = 0; url && hop <= maxRedirects; hop += 1) {
        let response: Response;
        try {
          response = await this.fetcher(url, { signal, redirect: "manual" });
        } catch {
          return { ok: false, failure: "transient" };
        }
        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get("location");
          url = location ? allowedDownload(new URL(location, url).toString()) : null;
          continue;
        }
        if (response.status === 429) return { ok: false, failure: "rate_limited" };
        if (response.status >= 500) return { ok: false, failure: "transient" };
        const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
        const declared = Number(response.headers.get("content-length"));
        if (!response.ok || !["image/jpeg", "image/png", "image/webp"].includes(contentType) ||
          (Number.isFinite(declared) && declared > this.maxDownloadBytes) || !response.body) {
          await response.body?.cancel().catch(() => undefined);
          return { ok: false, failure: "unsuitable" };
        }
        const body = await this.readCapped(response.body);
        if (body === "transient") return { ok: false, failure: "transient" };
        if (body === "too_large") return { ok: false, failure: "unsuitable" };
        return { ok: true, body, contentType };
      }
      return { ok: false, failure: "unsuitable" };
    }, { ok: false, failure: "transient" });
  }

  /** Counts the bytes that actually arrive: a missing or false Content-Length cannot overrun the cap. */
  private async readCapped(stream: ReadableStream<Uint8Array>): Promise<Uint8Array | "too_large" | "transient"> {
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > this.maxDownloadBytes) {
          await reader.cancel().catch(() => undefined);
          return "too_large";
        }
        chunks.push(value);
      }
    } catch {
      return "transient";
    }
    const body = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return body;
  }

  /** One request at a time; past `maxQueue` waiting, a request is refused rather than queued without end. */
  private async inTurn<T>(work: () => Promise<T>, busy: T): Promise<T> {
    if (this.running) {
      if (this.waiting.length >= this.maxQueue) return busy;
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }
    this.running = true;
    try {
      return await work();
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.running = false;
    }
  }
}
