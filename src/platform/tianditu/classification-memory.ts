import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { LocationCandidate } from "@/domain/location/location";

/**
 * What one `queryType 13` page answered, kept between server restarts.
 *
 * The classification search is the slow half of a place check — two requests per district,
 * each carrying up to 300 POIs — and the same districts are asked for again and again
 * (a manual search re-runs on every retype). The answers are only candidates for Meri's own
 * rules, never saved state, so a stale page costs at most a sight that moved. It is stored
 * as a file rather than in process memory so that it survives a `next dev` restart and can
 * be opened, inspected and deleted by hand.
 */
const ttlMs = 7 * 24 * 60 * 60 * 1_000;
/**
 * Measured 2026-10-23: one page of 300 POIs is about 95 KB, so two hundred pages is about
 * 19 MB — under one percent of a 2 GB server, and worth it against the second a miss costs.
 */
const maxEntries = 200;
const cacheFile = join(process.cwd(), ".cache", "tianditu-classification.json");

interface Entry {
  readonly at: number;
  readonly places: readonly LocationCandidate[];
}

interface CacheFile {
  readonly version: 1;
  readonly entries: Record<string, Entry>;
}

export interface ClassificationMemoryStats {
  readonly key: string;
  readonly count: number;
  readonly cachedAt: number;
  readonly expiresAt: number;
}

function keyOf(area: string, dataType: string): string {
  return `${area}|${dataType}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A file that cannot be read or parsed is an empty cache, never an error the caller sees. */
function readFile(file: string): Map<string, Entry> {
  const entries = new Map<string, Entry>();
  try {
    if (!existsSync(file)) return entries;
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (!isRecord(parsed) || parsed.version !== 1 || !isRecord(parsed.entries)) return entries;
    for (const [key, value] of Object.entries(parsed.entries)) {
      if (!isRecord(value) || typeof value.at !== "number" || !Array.isArray(value.places)) continue;
      entries.set(key, { at: value.at, places: value.places as LocationCandidate[] });
    }
  } catch {
    return new Map();
  }
  return entries;
}

export class ClassificationMemory {
  private entries: Map<string, Entry> | null = null;

  /** `file: null` keeps the cache in memory only — what the tests use, so they touch no disk. */
  constructor(
    private readonly file: string | null = cacheFile,
    private readonly now: () => number = Date.now,
  ) {}

  get(area: string, dataType: string): readonly LocationCandidate[] | null {
    const entries = this.load();
    const key = keyOf(area, dataType);
    const hit = entries.get(key);
    if (hit === undefined) return null;
    if (hit.at + ttlMs < this.now()) {
      entries.delete(key);
      return null;
    }
    return hit.places;
  }

  /** Only a real page is worth remembering: refusing or answering nothing must not be frozen. */
  set(area: string, dataType: string, places: readonly LocationCandidate[]): void {
    if (places.length === 0) return;
    const entries = this.load();
    entries.set(keyOf(area, dataType), { at: this.now(), places });
    if (entries.size > maxEntries) {
      const oldest = [...entries.entries()].sort((left, right) => left[1].at - right[1].at)
        .slice(0, entries.size - maxEntries);
      for (const [key] of oldest) entries.delete(key);
    }
    this.save(entries);
  }

  clear(): void {
    this.entries = new Map();
    if (this.file !== null) this.save(new Map());
  }

  stats(): readonly ClassificationMemoryStats[] {
    const now = this.now();
    return [...this.load().entries()]
      .map(([key, entry]) => ({ key, count: entry.places.length, cachedAt: entry.at, expiresAt: entry.at + ttlMs }))
      .filter((entry) => entry.expiresAt >= now)
      .sort((left, right) => right.cachedAt - left.cachedAt);
  }

  private load(): Map<string, Entry> {
    if (this.entries === null) this.entries = this.file === null ? new Map() : readFile(this.file);
    return this.entries;
  }

  private save(entries: Map<string, Entry>): void {
    if (this.file === null) return;
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      // Write beside the target and rename, so a crash mid-write cannot leave half a cache.
      const temporary = `${this.file}.${process.pid}.tmp`;
      const body: CacheFile = { version: 1, entries: Object.fromEntries(entries) };
      writeFileSync(temporary, JSON.stringify(body));
      renameSync(temporary, this.file);
    } catch {
      // A cache that cannot be written is still a working cache for this process.
    }
  }
}

/** One cache per server process, shared by every Tianditu client. */
export const sharedClassificationMemory = new ClassificationMemory();
