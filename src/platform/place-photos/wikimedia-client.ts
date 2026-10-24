import { readCappedBody } from "./capped-body";

/**
 * Wikidata's query service, the Commons API and Commons' image hosts, for the runtime
 * photo fallback. None of them needs a key; Wikimedia's policy asks for a User-Agent that
 * says who is asking, and limits by IP (the query service: 60 seconds of query time a
 * minute and five queries at once). Meri asks two at a time and at most 40 a minute.
 *
 * Mainland China cannot reach Wikimedia at all, so "transient" — no answer — is the
 * expected failure there: the finder then pauses Wikimedia and leaves the card to
 * Pixabay. Failures are named like the Pixabay client's so the two read the same.
 */
export type WikimediaFailure =
  /** 403: Wikimedia refused this client (its User-Agent policy). Asking again will not help. */
  | "refused"
  | "rate_limited"
  /** Network, timeout, 5xx, a full queue or an unreadable answer: try again later. */
  | "transient";

/** One row of a SPARQL answer: variable → value. */
export type SparqlRow = Readonly<Record<string, string>>;

export type QueryOutcome =
  | { readonly ok: true; readonly rows: readonly SparqlRow[] }
  | { readonly ok: false; readonly failure: WikimediaFailure };

/** What Commons says about one file, in Meri's terms; licence judgement is the caller's. */
export interface CommonsFile {
  readonly pageId: number;
  /** File:Jade Dragon Snow Mountain.jpg */
  readonly title: string;
  /** The Commons file page. */
  readonly pageUrl: string;
  readonly width: number;
  readonly height: number;
  readonly mime: string;
  /** A rendition `commonsThumbWidth` wide on thumb.wikimedia.org (or upload.wikimedia.org). */
  readonly thumbUrl: string;
  /** The author, as plain text; empty when Commons names none. */
  readonly artist: string;
  /** CC BY-SA 4.0, CC0, Public domain … as Commons writes it; empty when it names none. */
  readonly license: string;
  /** The licence's own page; empty for public-domain files, which have none. */
  readonly licenseUrl: string;
  /** Commons marks fair-use uploads (on other wikis) as non-free. */
  readonly nonFree: boolean;
}

export type FileOutcome =
  | { readonly ok: true; readonly file: CommonsFile | null }
  | { readonly ok: false; readonly failure: WikimediaFailure };

export type FilesOutcome =
  | { readonly ok: true; readonly files: ReadonlyMap<string, CommonsFile> }
  | { readonly ok: false; readonly failure: WikimediaFailure };

export type WikimediaDownloadOutcome =
  | { readonly ok: true; readonly body: Uint8Array; readonly contentType: string }
  /** "unsuitable": this file will never do — wrong host, not an image, too large, gone. */
  | { readonly ok: false; readonly failure: WikimediaFailure | "unsuitable" };

export interface WikimediaClientOptions {
  readonly fetcher?: typeof fetch;
  readonly perMinute?: number;
  readonly concurrency?: number;
  readonly now?: () => number;
  readonly maxQueue?: number;
  readonly queryTimeoutMs?: number;
  readonly downloadTimeoutMs?: number;
  readonly maxDownloadBytes?: number;
}

const userAgent = "MeriRoadTrip/1.0 (trip planner card photos; https://github.com/meiyulin22/Meri-Road-Trip)";
const sparqlUrl = "https://query.wikidata.org/sparql";
const commonsApiUrl = "https://commons.wikimedia.org/w/api.php";
/** Commons hands out thumbnails on thumb.wikimedia.org now (seen 2026-10-24), originals on upload. */
const downloadHosts = new Set(["upload.wikimedia.org", "thumb.wikimedia.org"]);
const maxRedirects = 2;
/**
 * Commons renders thumbnails at a few standard widths and rounds others up (640 came back
 * as 960, ~180 KB); 500 is one of them, ~55 KB, and still more than twice a card's 200px.
 */
export const commonsThumbWidth = 500;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Commons' Artist and licence fields are HTML; the credit line needs plain words. */
export function plainText(html: unknown): string {
  if (typeof html !== "string") return "";
  return html.replace(/<[^>]+>/gu, " ").replace(/&amp;/gu, "&").replace(/&quot;/gu, "\"").replace(/&#0?39;/gu, "'")
    .replace(/&nbsp;/gu, " ").replace(/\s+/gu, " ").trim();
}

function rowsOf(body: unknown): SparqlRow[] | null {
  const bindings = isRecord(body) && isRecord(body.results) ? body.results.bindings : undefined;
  if (!Array.isArray(bindings) || bindings.length > 500) return null;
  const rows: SparqlRow[] = [];
  for (const binding of bindings) {
    if (!isRecord(binding)) continue;
    const row: Record<string, string> = {};
    for (const [name, cell] of Object.entries(binding)) {
      if (isRecord(cell) && typeof cell.value === "string") row[name] = cell.value;
    }
    rows.push(row);
  }
  return rows;
}

function metaValue(meta: Record<string, unknown>, name: string): unknown {
  const field = meta[name];
  return isRecord(field) ? field.value : undefined;
}

function fileOfPage(page: unknown): CommonsFile | null {
  if (!isRecord(page) || typeof page.pageid !== "number" || typeof page.title !== "string") return null;
  const info = Array.isArray(page.imageinfo) ? page.imageinfo[0] : undefined;
  if (!isRecord(info) || typeof info.thumburl !== "string" || typeof info.descriptionurl !== "string" ||
    typeof info.width !== "number" || typeof info.height !== "number" || typeof info.mime !== "string") return null;
  const meta = isRecord(info.extmetadata) ? info.extmetadata : {};
  const licenseUrl = metaValue(meta, "LicenseUrl");
  return {
    pageId: page.pageid,
    title: page.title,
    pageUrl: info.descriptionurl.replace(/^http:\/\//u, "https://"),
    width: info.width,
    height: info.height,
    mime: info.mime,
    thumbUrl: info.thumburl,
    artist: plainText(metaValue(meta, "Artist")),
    license: plainText(metaValue(meta, "LicenseShortName")),
    licenseUrl: typeof licenseUrl === "string" ? licenseUrl.trim().replace(/^http:\/\//u, "https://") : "",
    nonFree: String(metaValue(meta, "NonFree") ?? "").toLowerCase() === "true",
  };
}

/**
 * The files of one answer by the name they were asked under. Commons answers with its own
 * spelling of each title ("_" read as a space, the first letter capitalised) and says
 * which asked title became which, so each file is filed back under the caller's name.
 */
function filesOf(body: unknown, asked: readonly string[]): Map<string, CommonsFile> | "unreadable" {
  const query = isRecord(body) && isRecord(body.query) ? body.query : undefined;
  if (!query || !Array.isArray(query.pages)) return "unreadable";
  const renamed = new Map<string, string>();
  for (const item of Array.isArray(query.normalized) ? query.normalized : []) {
    if (isRecord(item) && typeof item.from === "string" && typeof item.to === "string") renamed.set(item.to, item.from);
  }
  const askedTitles = new Set(asked.map((name) => `File:${name}`));
  const files = new Map<string, CommonsFile>();
  for (const page of query.pages) {
    const file = fileOfPage(page);
    if (!file) continue;
    const title = renamed.get(file.title) ?? file.title;
    if (askedTitles.has(title)) files.set(title.slice("File:".length), file);
  }
  return files;
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

function failureOf(status: number): WikimediaFailure | null {
  if (status === 429) return "rate_limited";
  if (status === 403) return "refused";
  return null;
}

export class WikimediaClient {
  private readonly fetcher: typeof fetch;
  private readonly perMinute: number;
  private readonly concurrency: number;
  private readonly now: () => number;
  private readonly maxQueue: number;
  private readonly queryTimeoutMs: number;
  private readonly downloadTimeoutMs: number;
  private readonly maxDownloadBytes: number;
  private running = 0;
  private readonly waiting: (() => void)[] = [];
  /** When each request of the last minute started. */
  private readonly started: number[] = [];
  /** Wikimedia sent Retry-After: nothing more until then. */
  private blockedUntil = 0;

  constructor(options: WikimediaClientOptions = {}) {
    this.fetcher = options.fetcher ?? fetch;
    this.perMinute = options.perMinute ?? 40;
    this.concurrency = options.concurrency ?? 2;
    this.now = options.now ?? Date.now;
    this.maxQueue = options.maxQueue ?? 24;
    this.queryTimeoutMs = options.queryTimeoutMs ?? 10_000;
    this.downloadTimeoutMs = options.downloadTimeoutMs ?? 15_000;
    this.maxDownloadBytes = options.maxDownloadBytes ?? 4 * 1024 * 1024;
  }

  /** Takes one of the minute's requests, or refuses, which the caller reads as a rate limit. */
  private admit(): boolean {
    const now = this.now();
    while (this.started.length > 0 && now - this.started[0] >= 60_000) this.started.shift();
    if (now < this.blockedUntil || this.started.length >= this.perMinute) return false;
    this.started.push(now);
    return true;
  }

  private heed(response: Response): void {
    if (response.status !== 429) return;
    const after = Number(response.headers.get("retry-after"));
    this.blockedUntil = this.now() + (Number.isFinite(after) && after > 0 ? Math.min(after, 300) : 60) * 1000;
  }

  private async json(url: URL): Promise<{ ok: true; body: unknown } | { ok: false; failure: WikimediaFailure }> {
    if (!this.admit()) return { ok: false, failure: "rate_limited" };
    let response: Response;
    try {
      response = await this.fetcher(url, { headers: { "User-Agent": userAgent, Accept: "application/json" },
        signal: AbortSignal.timeout(this.queryTimeoutMs), redirect: "error" });
    } catch {
      return { ok: false, failure: "transient" };
    }
    this.heed(response);
    const failure = failureOf(response.status);
    if (failure) return { ok: false, failure };
    if (!response.ok) return { ok: false, failure: "transient" };
    try {
      return { ok: true, body: await response.json() };
    } catch {
      return { ok: false, failure: "transient" };
    }
  }

  /** One SPARQL SELECT on Wikidata; each row maps a variable to its value. */
  async query(sparql: string): Promise<QueryOutcome> {
    const url = new URL(sparqlUrl);
    url.search = new URLSearchParams({ format: "json", query: sparql }).toString();
    return this.inTurn(async (): Promise<QueryOutcome> => {
      const answer = await this.json(url);
      if (!answer.ok) return answer;
      const rows = rowsOf(answer.body);
      return rows ? { ok: true, rows } : { ok: false, failure: "transient" };
    }, { ok: false, failure: "transient" });
  }

  /** Author, licence and a `commonsThumbWidth` rendition of one Commons file; null when there is no such file. */
  async file(name: string): Promise<FileOutcome> {
    const answer = await this.files([name]);
    return answer.ok ? { ok: true, file: answer.files.get(name) ?? null } : answer;
  }

  /** The same for up to 50 files in one request (Commons' limit); a name with no file is left out. */
  async files(names: readonly string[]): Promise<FilesOutcome> {
    if (names.length === 0 || names.length > 50) throw new Error(`Commons takes 1 to 50 files a request, not ${names.length}`);
    const url = new URL(commonsApiUrl);
    url.search = new URLSearchParams({ action: "query", format: "json", formatversion: "2", prop: "imageinfo",
      iiprop: "extmetadata|size|url|mime", iiurlwidth: String(commonsThumbWidth),
      iiextmetadatafilter: "Artist|LicenseShortName|LicenseUrl|NonFree",
      titles: names.map((name) => `File:${name}`).join("|") }).toString();
    return this.inTurn(async (): Promise<FilesOutcome> => {
      const answer = await this.json(url);
      if (!answer.ok) return answer;
      const files = filesOf(answer.body, names);
      return files === "unreadable" ? { ok: false, failure: "transient" } : { ok: true, files };
    }, { ok: false, failure: "transient" });
  }

  /** One image from Wikimedia's image hosts, following at most two redirects that stay on them. */
  async download(address: string): Promise<WikimediaDownloadOutcome> {
    return this.inTurn(async (): Promise<WikimediaDownloadOutcome> => {
      let url = allowedDownload(address);
      const signal = AbortSignal.timeout(this.downloadTimeoutMs);
      for (let hop = 0; url && hop <= maxRedirects; hop += 1) {
        if (!this.admit()) return { ok: false, failure: "rate_limited" };
        let response: Response;
        try {
          response = await this.fetcher(url, { headers: { "User-Agent": userAgent }, signal, redirect: "manual" });
        } catch {
          return { ok: false, failure: "transient" };
        }
        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get("location");
          url = location ? allowedDownload(new URL(location, url).toString()) : null;
          continue;
        }
        this.heed(response);
        const failure = failureOf(response.status);
        if (failure) return { ok: false, failure };
        if (response.status >= 500) return { ok: false, failure: "transient" };
        const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
        const declared = Number(response.headers.get("content-length"));
        if (!response.ok || !["image/jpeg", "image/png", "image/webp"].includes(contentType) ||
          (Number.isFinite(declared) && declared > this.maxDownloadBytes) || !response.body) {
          await response.body?.cancel().catch(() => undefined);
          return { ok: false, failure: "unsuitable" };
        }
        const body = await readCappedBody(response.body, this.maxDownloadBytes);
        if (body === "transient") return { ok: false, failure: "transient" };
        if (body === "too_large") return { ok: false, failure: "unsuitable" };
        return { ok: true, body, contentType };
      }
      return { ok: false, failure: "unsuitable" };
    }, { ok: false, failure: "transient" });
  }

  /** At most `concurrency` requests at once; past `maxQueue` waiting, a request is refused rather than queued without end. */
  private async inTurn<T>(work: () => Promise<T>, busy: T): Promise<T> {
    if (this.running >= this.concurrency) {
      if (this.waiting.length >= this.maxQueue) return busy;
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    } else {
      this.running += 1;
    }
    try {
      return await work();
    } finally {
      const next = this.waiting.shift();
      // The slot passes straight to the next request; only an empty queue frees it.
      if (next) next();
      else this.running -= 1;
    }
  }
}
