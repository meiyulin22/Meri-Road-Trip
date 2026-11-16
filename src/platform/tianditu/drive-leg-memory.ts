import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { DriveRoute, LonLat } from "./tianditu-drive";

type Entry = DriveRoute & { readonly at: number };

const dayMs = 24 * 60 * 60 * 1_000;
// Roads change slowly; a month keeps repeated plans from asking again (1.2102).
const ttlMs = 30 * dayMs;
const maxEntries = 2_000;
const cacheFile = join(process.cwd(), ".cache", "tianditu-drive-legs.json");

/** The two points, rounded to about a metre, as one key. */
export function driveLegKey(from: LonLat, to: LonLat): string {
  const point = ({ longitude, latitude }: LonLat) => `${longitude.toFixed(5)},${latitude.toFixed(5)}`;
  return `${point(from)}>${point(to)}`;
}

function parseEntry(value: unknown): Entry | null {
  if (typeof value !== "object" || value === null) return null;
  const { at, distanceKm, durationSeconds, path } = value as Record<string, unknown>;
  if (typeof at !== "number" || typeof distanceKm !== "number" || typeof durationSeconds !== "number" || !Array.isArray(path)) return null;
  const points = path.filter((point): point is [number, number] =>
    Array.isArray(point) && point.length === 2 && point.every((number) => typeof number === "number"));
  return points.length === path.length && points.length >= 2 ? { at, distanceKm, durationSeconds, path: points } : null;
}

/**
 * Driving legs Tianditu already planned, kept between server restarts so the same two
 * stops are not asked again. A failed lookup is never stored.
 */
export class DriveLegMemory {
  private entries: Map<string, Entry> | null = null;

  /** `file: null` keeps the cache in memory only, as the tests use it. */
  constructor(
    private readonly file: string | null = cacheFile,
    private readonly now: () => number = Date.now,
  ) {}

  get(key: string): DriveRoute | null {
    const hit = this.load().get(key);
    if (!hit) return null;
    if (hit.at + ttlMs < this.now()) {
      this.load().delete(key);
      return null;
    }
    return { distanceKm: hit.distanceKm, durationSeconds: hit.durationSeconds, path: hit.path };
  }

  set(key: string, route: DriveRoute): void {
    const entries = this.load();
    entries.set(key, { ...route, at: this.now() });
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
export const sharedDriveLegMemory = new DriveLegMemory();
