import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * What Tianditu said about one spot inside one 市, kept between server restarts so the
 * same spot is not looked up again for every plan. Only the judgement is kept, not the
 * page: whether the spot was found there, its district and the name Tianditu uses.
 * A failed lookup is never stored.
 */
export type RememberedSpotLocation =
  | { readonly status: "located"; readonly district: string | null; readonly mapName: string }
  | { readonly status: "not_located" };

type Entry = RememberedSpotLocation & { readonly at: number };

const dayMs = 24 * 60 * 60 * 1_000;
// A spot that was found rarely moves; one that was not may be added to the map later.
const locatedTtlMs = 30 * dayMs;
const notLocatedTtlMs = 7 * dayMs;
const maxEntries = 2_000;
const cacheFile = join(process.cwd(), ".cache", "tianditu-spot-locations.json");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseEntry(value: unknown): Entry | null {
  if (!isRecord(value) || typeof value.at !== "number") return null;
  if (value.status === "not_located") return { status: "not_located", at: value.at };
  if (value.status !== "located" || typeof value.mapName !== "string") return null;
  const district = typeof value.district === "string" ? value.district : null;
  return { status: "located", district, mapName: value.mapName, at: value.at };
}

/** A file that cannot be read or parsed is an empty cache, never an error the caller sees. */
function readFile(file: string): Map<string, Entry> {
  const entries = new Map<string, Entry>();
  try {
    if (!existsSync(file)) return entries;
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (!isRecord(parsed) || parsed.version !== 1 || !isRecord(parsed.entries)) return entries;
    for (const [key, value] of Object.entries(parsed.entries)) {
      const entry = parseEntry(value);
      if (entry) entries.set(key, entry);
    }
  } catch {
    return new Map();
  }
  return entries;
}

export class SpotLocationMemory {
  private entries: Map<string, Entry> | null = null;

  /** `file: null` keeps the cache in memory only — what the tests use, so they touch no disk. */
  constructor(
    private readonly file: string | null = cacheFile,
    private readonly now: () => number = Date.now,
  ) {}

  get(key: string): RememberedSpotLocation | null {
    const entries = this.load();
    const hit = entries.get(key);
    if (hit === undefined) return null;
    const ttl = hit.status === "located" ? locatedTtlMs : notLocatedTtlMs;
    if (hit.at + ttl < this.now()) {
      entries.delete(key);
      return null;
    }
    return hit.status === "located"
      ? { status: "located", district: hit.district, mapName: hit.mapName }
      : { status: "not_located" };
  }

  set(key: string, location: RememberedSpotLocation): void {
    const entries = this.load();
    entries.set(key, { ...location, at: this.now() });
    if (entries.size > maxEntries) {
      const oldest = [...entries.entries()].sort((left, right) => left[1].at - right[1].at)
        .slice(0, entries.size - maxEntries);
      for (const [stale] of oldest) entries.delete(stale);
    }
    this.save(entries);
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
      writeFileSync(temporary, JSON.stringify({ version: 1, entries: Object.fromEntries(entries) }));
      renameSync(temporary, this.file);
    } catch {
      // A cache that cannot be written is still a working cache for this process.
    }
  }
}

/** One cache per server process. */
export const sharedSpotLocationMemory = new SpotLocationMemory();
