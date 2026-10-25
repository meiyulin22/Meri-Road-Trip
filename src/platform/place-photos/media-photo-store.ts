import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { PlaceImage } from "@/domain/location/place-image";

import { contentTypeOf, type ImageFormat } from "./image-file";
import { normalizePlaceName } from "./photo-catalog";
import type { PixabayHit } from "./pixabay-photo-match";

/**
 * Photos Meri downloaded while running, kept on disk outside the release so they
 * survive a deploy and a restart. Production's `public/` is inventoried when the server
 * starts, so a file written there later would not be served; these are served by
 * `/media/place-photos/[file]` instead.
 *
 *   <MERI_MEDIA_DIR>/place-photos/files/<source>-<id>.<ext>  the image: pixabay-<photo id> or wikimedia-<Commons page id>
 *   <MERI_MEDIA_DIR>/place-photos/files/<source>-<id>.json   its source, licence and checks; written last, so it marks a complete file
 *   <MERI_MEDIA_DIR>/place-photos/lookups/<hash>.json        which photo a region + landmark settled on, from either source
 *   <MERI_MEDIA_DIR>/place-photos/lookups/<hash>.none.json   that Pixabay had none under rules version N, kept as long as the searches behind it
 *   <MERI_MEDIA_DIR>/place-photos/lookups/<hash>.wikimedia-none.json   the same for Wikidata, for 24 hours
 *   <MERI_MEDIA_DIR>/place-photos/regions/<hash>.json        the photos published for one 市, for a city card whose own landmark has none
 *   <MERI_MEDIA_DIR>/place-photos/misses/<hash>.json         a landmark that found nothing: how often, what was asked, why hits were refused
 *   <MERI_MEDIA_DIR>/place-photos/searches/<hash>.json       a Pixabay search answer, kept 24 hours as Pixabay requires
 *
 * Every write goes to a temporary name first and is renamed into place, so a crash
 * leaves either the old state or the new one, never half a file under a real name.
 */
export const mediaPhotoUrlPrefix = "/media/place-photos/";

/** Our own names only: a request can never reach a path it made up. */
export const mediaPhotoFilePattern = /^(?:pixabay|wikimedia)-[1-9]\d{0,11}\.(?:jpg|png|webp)$/u;

export type RemotePhotoSource = "pixabay" | "wikimedia";

export const searchCacheTtlMs = 24 * 60 * 60 * 1000;

export const defaultMediaMaxBytes = 500 * 1024 * 1024;

/** Which landmark in which region: 西湖 in 杭州市 and 西湖 in 惠州市 are two lookups. */
export interface PhotoLookupKey {
  readonly region: string;
  readonly landmark: string;
}

interface StoredPhotoFacts {
  readonly file: string;
  readonly format: ImageFormat;
  readonly width: number;
  readonly height: number;
  readonly bytes: number;
  readonly artist: string;
  /** The photo's own page: a Pixabay photo page or a Commons file page. */
  readonly pageUrl: string;
  readonly province: string;
  readonly region: string;
  readonly landmark: string;
  /** Chosen by code; no person has looked at it. */
  readonly reviewed: false;
  readonly fetchedAt: string;
}

/** A Pixabay photo, chosen from the uploader's tags. */
export interface PixabayPhotoRecord extends StoredPhotoFacts {
  readonly source: "pixabay";
  readonly id: number;
  /** The contributor's profile, when Pixabay supplied their user ID. */
  readonly artistUrl?: string;
  readonly tags: string;
  /** The search that found it and the words of the name its tags carried. */
  readonly query: string;
  readonly matched: readonly string[];
}

/**
 * A Commons photo, the P18 image of a Wikidata item whose name is the landmark and which
 * lies in the card's 市. Creative Commons asks for the author, the licence with its link,
 * the source and a note that the copy was resized: the card names the licence and resizing,
 * links to the Commons file page, and retains the full source facts here.
 */
export interface WikimediaPhotoRecord extends StoredPhotoFacts {
  readonly source: "wikimedia";
  /** The Commons page id, which is also the file name. */
  readonly id: number;
  /** File:Jade Dragon Snow Mountain.jpg */
  readonly title: string;
  /** The Wikidata item, Q-id: https://www.wikidata.org/wiki/<item>. */
  readonly item: string;
  /** The name of the item that matched the landmark. */
  readonly matched: string;
  readonly license: string;
  readonly licenseUrl: string;
  readonly originalWidth: number;
  readonly originalHeight: number;
}

/** What is recorded about a published photo, beside the file itself. */
export type StoredPhotoRecord = PixabayPhotoRecord | WikimediaPhotoRecord;

/** What scripts/photo-misses.ts lists: a landmark that keeps finding no photo, and why. */
export interface PhotoMiss {
  readonly province: string;
  readonly region: string;
  readonly landmark: string;
  readonly searches: readonly { readonly q: string; readonly lang: string; readonly hits: number; readonly cached: boolean }[];
  readonly rejected: Readonly<Record<string, number>>;
  /** Candidates that passed the tags but whose file was refused (wrong format, too small, gone). */
  readonly rejectedFiles: number;
  readonly count: number;
  readonly firstAt: string;
  readonly lastAt: string;
}

interface StoredLookup {
  readonly region: string;
  readonly landmark: string;
  readonly file: string;
  readonly caption: string;
  readonly credit: string;
}

export function lookupKeyText(key: PhotoLookupKey): string {
  return `${normalizePlaceName(key.region)}|${normalizePlaceName(key.landmark)}`;
}

function hashOf(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJson(file: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as unknown;
  } catch {
    return null;
  }
}

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

/** Writes beside the target and renames over it: readers see the old file or the new one. */
async function writeAtomically(file: string, body: string | Uint8Array): Promise<void> {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, body);
    await rename(temporary, file);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

/** The Pixabay marker keeps its 1.0624 name, so "none" decided before Wikimedia existed still counts. */
function noneFileName(text: string, source: RemotePhotoSource): string {
  return `${hashOf(text)}.${source === "pixabay" ? "none" : "wikimedia-none"}.json`;
}

function isWikimediaRecord(value: unknown): value is WikimediaPhotoRecord {
  if (!isRecord(value)) return false;
  const strings = ["file", "artist", "pageUrl", "title", "item", "license", "licenseUrl", "landmark", "region", "fetchedAt"];
  return value.source === "wikimedia" && strings.every((name) => typeof value[name] === "string") &&
    typeof value.file === "string" && mediaPhotoFilePattern.test(value.file) && value.file.startsWith("wikimedia-") &&
    typeof value.pageUrl === "string" && value.pageUrl.startsWith("https://commons.wikimedia.org/wiki/File:") &&
    typeof value.licenseUrl === "string" && value.licenseUrl.startsWith("https://");
}

function isHit(value: unknown): value is PixabayHit {
  if (!isRecord(value)) return false;
  return typeof value.id === "number" && Number.isSafeInteger(value.id) && value.id > 0 &&
    typeof value.tags === "string" && typeof value.pageURL === "string" && typeof value.webformatURL === "string" &&
    typeof value.user === "string" &&
    (value.user_id === undefined || (Number.isSafeInteger(value.user_id) && (value.user_id as number) > 0)) &&
    typeof value.imageWidth === "number" && value.imageWidth > 0 &&
    typeof value.imageHeight === "number" && value.imageHeight > 0;
}

export class MediaPhotoStore {
  private readonly files: string;
  private readonly lookups: string;
  private readonly searches: string;
  private readonly found = new Map<string, PlaceImage>();
  private usedBytes: number | null = null;
  private searchWrites = 0;
  /** Publishing is one at a time, so the size check and the write cannot interleave. */
  private publishing: Promise<unknown> = Promise.resolve();

  private readonly regions: string;
  private readonly misses: string;

  constructor(directory: string, private readonly maxBytes: number = defaultMediaMaxBytes) {
    const root = join(directory, "place-photos");
    this.files = join(root, "files");
    this.lookups = join(root, "lookups");
    this.searches = join(root, "searches");
    this.regions = join(root, "regions");
    this.misses = join(root, "misses");
  }

  /** The photo a lookup settled on earlier, or null; a lookup whose file is gone counts as none. */
  async readLookup(key: PhotoLookupKey): Promise<PlaceImage | null> {
    const text = lookupKeyText(key);
    const remembered = this.found.get(text);
    if (remembered) return remembered;
    const stored = await readJson(join(this.lookups, `${hashOf(text)}.json`));
    if (!isRecord(stored) || typeof stored.file !== "string" || !mediaPhotoFilePattern.test(stored.file) ||
      typeof stored.caption !== "string" || typeof stored.credit !== "string" ||
      lookupKeyText({ region: String(stored.region), landmark: String(stored.landmark) }) !== text ||
      !(await this.isPublished(stored.file))) return null;
    const image = { url: `${mediaPhotoUrlPrefix}${stored.file}`, caption: stored.caption, credit: stored.credit };
    this.found.set(text, image);
    return image;
  }

  async writeLookup(key: PhotoLookupKey, file: string, image: PlaceImage): Promise<void> {
    const record: StoredLookup = { region: key.region, landmark: key.landmark, file,
      caption: image.caption, credit: image.credit ?? "" };
    await mkdir(this.lookups, { recursive: true });
    await writeAtomically(join(this.lookups, `${hashOf(lookupKeyText(key))}.json`), JSON.stringify(record));
    this.found.set(lookupKeyText(key), image);
    await this.addToRegion(key, record);
  }

  /**
   * A photo published for some landmark in this 市, for a card about the 市 itself whose
   * own landmark has none; its caption stays the landmark it really shows. Earliest first.
   */
  async readAnyForRegion(region: string): Promise<PlaceImage | null> {
    const stored = await readJson(join(this.regions, `${hashOf(normalizePlaceName(region))}.json`));
    if (!isRecord(stored) || !Array.isArray(stored.photos)) return null;
    for (const photo of stored.photos) {
      if (!isRecord(photo) || typeof photo.file !== "string" || !mediaPhotoFilePattern.test(photo.file) ||
        typeof photo.caption !== "string" || typeof photo.credit !== "string" || !(await this.isPublished(photo.file))) continue;
      return { url: `${mediaPhotoUrlPrefix}${photo.file}`, caption: photo.caption, credit: photo.credit };
    }
    return null;
  }

  private async addToRegion(key: PhotoLookupKey, record: StoredLookup): Promise<void> {
    const file = join(this.regions, `${hashOf(normalizePlaceName(key.region))}.json`);
    const stored = await readJson(file);
    const photos = isRecord(stored) && Array.isArray(stored.photos) ? stored.photos.filter(isRecord) : [];
    if (photos.some((photo) => photo.file === record.file) || photos.length >= 20) return;
    await mkdir(this.regions, { recursive: true });
    await writeAtomically(file, JSON.stringify({ region: key.region,
      photos: [...photos, { file: record.file, caption: record.caption, credit: record.credit }] }));
  }

  /** Counts a landmark that found no photo, keeping the latest searches and refusal reasons. */
  async recordMiss(miss: Omit<PhotoMiss, "count" | "firstAt" | "lastAt">, now: number): Promise<void> {
    const file = join(this.misses, `${hashOf(lookupKeyText(miss))}.json`);
    const stored = await readJson(file);
    const at = new Date(now).toISOString();
    const previous = isRecord(stored) && typeof stored.count === "number" && typeof stored.firstAt === "string"
      ? { count: stored.count, firstAt: stored.firstAt } : { count: 0, firstAt: at };
    await mkdir(this.misses, { recursive: true });
    await writeAtomically(file, JSON.stringify({ ...miss, count: previous.count + 1, firstAt: previous.firstAt, lastAt: at }, null, 1));
  }

  async listMisses(): Promise<readonly PhotoMiss[]> {
    let names: string[] = [];
    try {
      names = (await readdir(this.misses)).filter((name) => name.endsWith(".json"));
    } catch {
      return [];
    }
    const misses: PhotoMiss[] = [];
    for (const name of names) {
      const stored = await readJson(join(this.misses, name));
      if (isRecord(stored) && typeof stored.landmark === "string" && typeof stored.region === "string" &&
        typeof stored.count === "number") misses.push(stored as unknown as PhotoMiss);
    }
    return misses.sort((left, right) => right.count - left.count || right.lastAt.localeCompare(left.lastAt));
  }

  /**
   * Whether this lookup was decided as having no suitable photo within the last 24 hours,
   * under these same rules: better rules may find what older ones refused.
   */
  async recentlyNone(key: PhotoLookupKey, now: number, rules: number, source: RemotePhotoSource): Promise<boolean> {
    const text = lookupKeyText(key);
    const stored = await readJson(join(this.lookups, noneFileName(text, source)));
    return isRecord(stored) && stored.key === text && stored.rules === rules && typeof stored.decidedAt === "number" &&
      stored.decidedAt <= now && now - stored.decidedAt < searchCacheTtlMs;
  }

  async writeNone(key: PhotoLookupKey, now: number, rules: number, source: RemotePhotoSource): Promise<void> {
    const text = lookupKeyText(key);
    await mkdir(this.lookups, { recursive: true });
    await writeAtomically(join(this.lookups, noneFileName(text, source)), JSON.stringify({ key: text, decidedAt: now, rules }));
  }

  /**
   * Every published Commons photo, newest first, for source inspection. Read from the records
   * themselves, so a photo is listed exactly when it can be served.
   */
  async listWikimediaRecords(): Promise<readonly WikimediaPhotoRecord[]> {
    let names: string[] = [];
    try {
      names = (await readdir(this.files)).filter((name) => /^wikimedia-\d+\.json$/u.test(name));
    } catch {
      return [];
    }
    const records: WikimediaPhotoRecord[] = [];
    for (const name of names) {
      const stored = await readJson(join(this.files, name));
      if (isWikimediaRecord(stored) && await exists(join(this.files, stored.file))) records.push(stored);
    }
    return records.sort((left, right) => right.fetchedAt.localeCompare(left.fetchedAt));
  }

  /** A search answered within the last 24 hours, empty answers included; null means ask again. */
  async readSearch(parameters: string, now: number): Promise<readonly PixabayHit[] | null> {
    const stored = await readJson(join(this.searches, `${hashOf(parameters)}.json`));
    if (!isRecord(stored) || stored.parameters !== parameters || typeof stored.fetchedAt !== "number" ||
      stored.fetchedAt > now || now - stored.fetchedAt >= searchCacheTtlMs ||
      !Array.isArray(stored.hits) || !stored.hits.every(isHit)) return null;
    return stored.hits;
  }

  /** `parameters` describes the search and never holds the API key. */
  async writeSearch(parameters: string, hits: readonly PixabayHit[], now: number): Promise<void> {
    await mkdir(this.searches, { recursive: true });
    await writeAtomically(join(this.searches, `${hashOf(parameters)}.json`),
      JSON.stringify({ parameters, fetchedAt: now, hits }));
    // Answers older than a day are never read again; every fiftieth write clears them out.
    this.searchWrites += 1;
    if (this.searchWrites % 50 === 1) await this.pruneSearches(now);
  }

  /** Deletes search answers past their 24 hours. */
  async pruneSearches(now: number): Promise<number> {
    let removed = 0;
    let names: string[] = [];
    try {
      names = await readdir(this.searches);
    } catch {
      return 0;
    }
    for (const name of names) {
      const stored = await readJson(join(this.searches, name));
      if (!isRecord(stored) || typeof stored.fetchedAt !== "number" || now - stored.fetchedAt >= searchCacheTtlMs) {
        await rm(join(this.searches, name), { force: true });
        removed += 1;
      }
    }
    return removed;
  }

  /**
   * Stores a checked photo. "full" when it would take the store past its cap: new
   * photos stop being admitted, and none already referenced by a message is deleted.
   */
  async publish(record: StoredPhotoRecord, body: Uint8Array): Promise<"published" | "full"> {
    const next = this.publishing.then(() => this.publishNow(record, body));
    this.publishing = next.catch(() => undefined);
    return next;
  }

  /** The file a request names, once it is complete; null for anything else. */
  async readPublished(file: string): Promise<{ readonly body: Uint8Array; readonly contentType: string } | null> {
    if (!mediaPhotoFilePattern.test(file) || !(await this.isPublished(file))) return null;
    try {
      const body = new Uint8Array(await readFile(join(this.files, file)));
      const format = file.slice(file.lastIndexOf(".") + 1) as ImageFormat;
      return { body, contentType: contentTypeOf[format] };
    } catch {
      return null;
    }
  }

  /** Source facts for an existing card's credit, without changing its saved image. */
  async readPhotoCredit(file: string): Promise<{
    readonly source: RemotePhotoSource; readonly artist: string; readonly pageUrl: string; readonly artistUrl?: string;
  } | null> {
    if (!mediaPhotoFilePattern.test(file)) return null;
    const stored = await readJson(join(this.files, `${file.slice(0, file.lastIndexOf("."))}.json`));
    if (!isRecord(stored) || (stored.source !== "pixabay" && stored.source !== "wikimedia") ||
      !file.startsWith(`${stored.source}-`) || stored.file !== file || typeof stored.artist !== "string" ||
      typeof stored.pageUrl !== "string" || !(await exists(join(this.files, file)))) return null;
    return { source: stored.source, artist: stored.artist, pageUrl: stored.pageUrl,
      ...(typeof stored.artistUrl === "string" ? { artistUrl: stored.artistUrl } : {}) };
  }

  private async isPublished(file: string): Promise<boolean> {
    const record = await readJson(join(this.files, `${file.slice(0, file.lastIndexOf("."))}.json`));
    return isRecord(record) && record.file === file && await exists(join(this.files, file));
  }

  private async used(): Promise<number> {
    if (this.usedBytes !== null) return this.usedBytes;
    let total = 0;
    try {
      for (const name of await readdir(this.files)) {
        if (name.endsWith(".tmp")) continue;
        total += (await stat(join(this.files, name))).size;
      }
    } catch {
      // No directory yet: nothing stored.
    }
    this.usedBytes = total;
    return total;
  }

  private async publishNow(record: StoredPhotoRecord, body: Uint8Array): Promise<"published" | "full"> {
    if (await this.isPublished(record.file)) return "published";
    const metadata = `${JSON.stringify(record, null, 1)}\n`;
    const size = body.byteLength + Buffer.byteLength(metadata);
    const used = await this.used();
    if (used + size > this.maxBytes) return "full";
    await mkdir(this.files, { recursive: true });
    await writeAtomically(join(this.files, record.file), body);
    // The record goes last: until it exists the file is not served or reused.
    await writeAtomically(join(this.files, `${record.file.slice(0, record.file.lastIndexOf("."))}.json`), metadata);
    this.usedBytes = used + size;
    return "published";
  }
}

let shared: MediaPhotoStore | null | undefined;

/**
 * The store for this process, from MERI_MEDIA_DIR (and MERI_MEDIA_MAX_BYTES, default
 * 500 MB). Development without the variable uses `.cache/media` in the checkout; a
 * production server without it has no runtime photos at all rather than writing into
 * a release directory the next deploy replaces.
 */
export function mediaPhotoStoreFromEnvironment(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): MediaPhotoStore | null {
  if (shared !== undefined && environment === process.env) return shared;
  const configured = environment.MERI_MEDIA_DIR?.trim();
  const directory = configured || (environment.NODE_ENV === "production" ? null : join(process.cwd(), ".cache", "media"));
  const cap = Number(environment.MERI_MEDIA_MAX_BYTES);
  const store = directory ? new MediaPhotoStore(directory, Number.isSafeInteger(cap) && cap > 0 ? cap : defaultMediaMaxBytes) : null;
  if (environment === process.env) shared = store;
  return store;
}
