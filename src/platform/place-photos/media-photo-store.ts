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
 *   <MERI_MEDIA_DIR>/place-photos/files/pixabay-<id>.<ext>   the image
 *   <MERI_MEDIA_DIR>/place-photos/files/pixabay-<id>.json    its source and checks; written last, so it marks a complete file
 *   <MERI_MEDIA_DIR>/place-photos/lookups/<hash>.json        which photo a region + landmark settled on
 *   <MERI_MEDIA_DIR>/place-photos/lookups/<hash>.none.json   that it found none, kept as long as the searches behind it
 *   <MERI_MEDIA_DIR>/place-photos/searches/<hash>.json       a Pixabay search answer, kept 24 hours as Pixabay requires
 *
 * Every write goes to a temporary name first and is renamed into place, so a crash
 * leaves either the old state or the new one, never half a file under a real name.
 */
export const mediaPhotoUrlPrefix = "/media/place-photos/";

/** Our own names only: a request can never reach a path it made up. */
export const mediaPhotoFilePattern = /^pixabay-[1-9]\d{0,11}\.(?:jpg|png|webp)$/u;

export const searchCacheTtlMs = 24 * 60 * 60 * 1000;

export const defaultMediaMaxBytes = 500 * 1024 * 1024;

/** Which landmark in which region: 西湖 in 杭州市 and 西湖 in 惠州市 are two lookups. */
export interface PhotoLookupKey {
  readonly region: string;
  readonly landmark: string;
}

/** What is recorded about a published photo, beside the file itself. */
export interface StoredPhotoRecord {
  readonly source: "pixabay";
  readonly id: number;
  readonly file: string;
  readonly format: ImageFormat;
  readonly width: number;
  readonly height: number;
  readonly bytes: number;
  readonly artist: string;
  readonly pageUrl: string;
  readonly tags: string;
  /** The search that found it and the words of the name its tags carried. */
  readonly query: string;
  readonly matched: readonly string[];
  readonly province: string;
  readonly region: string;
  readonly landmark: string;
  /** Chosen by code from the uploader's tags; no person has looked at it. */
  readonly reviewed: false;
  readonly fetchedAt: string;
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

function isHit(value: unknown): value is PixabayHit {
  if (!isRecord(value)) return false;
  return typeof value.id === "number" && Number.isSafeInteger(value.id) && value.id > 0 &&
    typeof value.tags === "string" && typeof value.pageURL === "string" && typeof value.webformatURL === "string" &&
    typeof value.user === "string" && typeof value.imageWidth === "number" && value.imageWidth > 0 &&
    typeof value.imageHeight === "number" && value.imageHeight > 0;
}

export class MediaPhotoStore {
  private readonly files: string;
  private readonly lookups: string;
  private readonly searches: string;
  private readonly found = new Map<string, PlaceImage>();
  private usedBytes: number | null = null;
  /** Publishing is one at a time, so the size check and the write cannot interleave. */
  private publishing: Promise<unknown> = Promise.resolve();

  constructor(directory: string, private readonly maxBytes: number = defaultMediaMaxBytes) {
    const root = join(directory, "place-photos");
    this.files = join(root, "files");
    this.lookups = join(root, "lookups");
    this.searches = join(root, "searches");
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
  }

  /** Whether this lookup was decided as having no suitable photo within the last 24 hours. */
  async recentlyNone(key: PhotoLookupKey, now: number): Promise<boolean> {
    const text = lookupKeyText(key);
    const stored = await readJson(join(this.lookups, `${hashOf(text)}.none.json`));
    return isRecord(stored) && stored.key === text && typeof stored.decidedAt === "number" &&
      stored.decidedAt <= now && now - stored.decidedAt < searchCacheTtlMs;
  }

  async writeNone(key: PhotoLookupKey, now: number): Promise<void> {
    const text = lookupKeyText(key);
    await mkdir(this.lookups, { recursive: true });
    await writeAtomically(join(this.lookups, `${hashOf(text)}.none.json`), JSON.stringify({ key: text, decidedAt: now }));
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
