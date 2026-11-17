import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { CityPoint } from "./tianditu-city-point";

type Entry = CityPoint & { readonly at: number };

const dayMs = 24 * 60 * 60 * 1_000;
// A city's centre is its government seat, which hardly ever moves (1.2106).
const ttlMs = 180 * dayMs;
const maxEntries = 2_000;
const cacheFile = join(process.cwd(), ".cache", "tianditu-city-points.json");

function parseEntry(value: unknown): Entry | null {
  if (typeof value !== "object" || value === null) return null;
  const { at, name, adminCode, point } = value as Record<string, unknown>;
  if (typeof at !== "number" || typeof name !== "string" || typeof adminCode !== "string") return null;
  if (typeof point !== "object" || point === null) return null;
  const { longitude, latitude } = point as Record<string, unknown>;
  if (typeof longitude !== "number" || typeof latitude !== "number") return null;
  return { at, name, adminCode, point: { longitude, latitude } };
}

/**
 * City centres Tianditu already answered, by the name asked, kept between server restarts so a
 * city is looked up once. "Not found" and failures are never stored: a typo fixed or a refusal
 * lifted is asked again.
 */
export class CityPointMemory {
  private entries: Map<string, Entry> | null = null;

  /** `file: null` keeps the cache in memory only, as the tests use it. */
  constructor(
    private readonly file: string | null = cacheFile,
    private readonly now: () => number = Date.now,
  ) {}

  get(name: string): CityPoint | null {
    const hit = this.load().get(name);
    if (!hit) return null;
    if (hit.at + ttlMs < this.now()) {
      this.load().delete(name);
      return null;
    }
    return { name: hit.name, adminCode: hit.adminCode, point: hit.point };
  }

  set(name: string, city: CityPoint): void {
    const entries = this.load();
    entries.set(name, { ...city, at: this.now() });
    if (entries.size > maxEntries) {
      const oldest = [...entries.entries()].sort((left, right) => left[1].at - right[1].at).slice(0, entries.size - maxEntries);
      for (const [stale] of oldest) entries.delete(stale);
    }
    if (this.file === null) return;
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      // Write beside the target and rename, so a crash mid-write cannot leave half a cache.
      const temporary = `${this.file}.${process.pid}.tmp`;
      writeFileSync(temporary, JSON.stringify({ version: 1, entries: Object.fromEntries(entries) }));
      renameSync(temporary, this.file);
    } catch {
      // A cache that cannot be written is still a working cache for this process.
    }
  }

  private load(): Map<string, Entry> {
    if (this.entries !== null) return this.entries;
    const entries = new Map<string, Entry>();
    try {
      if (this.file !== null && existsSync(this.file)) {
        const parsed = JSON.parse(readFileSync(this.file, "utf8")) as { version?: unknown; entries?: Record<string, unknown> };
        if (parsed.version === 1 && parsed.entries) {
          for (const [key, value] of Object.entries(parsed.entries)) {
            const entry = parseEntry(value);
            if (entry) entries.set(key, entry);
          }
        }
      }
    } catch {
      // A file that cannot be read is an empty cache.
    }
    this.entries = entries;
    return entries;
  }
}

/** One cache per server process. */
export const sharedCityPointMemory = new CityPointMemory();
