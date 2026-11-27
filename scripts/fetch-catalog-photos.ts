/** Run from the repo root with node --env-file=.env.local --import tsx. */
import { appendFile, mkdir, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { parseArgs } from "node:util";
import pg from "pg";
import sharp from "sharp";

import { WikimediaClient, type WikimediaFailure } from "@/platform/place-photos/wikimedia-client";
import {
  manifestEntry, photoCandidates, photoFilename, photoQuery, photoWidth, pickCandidate,
  type CatalogPhotoSubject, type ManifestEntry, type Rejection,
} from "./fetch-catalog-photos-pick";

const cacheDir = ".cache/catalog-photos";
const photoDir = "public/photos/catalog";
const manifestPath = "src/platform/place-photos/catalog-entry-photos.json";
const rejectedPath = join(cacheDir, "rejected.ndjson");
const reviewPath = join(cacheDir, "review.html");

type Manifest = Record<string, ManifestEntry>;
type RejectedPhoto = Rejection & Pick<CatalogPhotoSubject, "id" | "name">;
type LookupOperation = "Wikidata query" | "Commons metadata" | "Commons download";
type Lookup = { photo: ManifestEntry; body: Buffer } | { rejection: Rejection }
  | { operation: LookupOperation; unavailable: WikimediaFailure };

async function loadSubjects(cities: readonly string[], kind?: CatalogPhotoSubject["kind"]): Promise<CatalogPhotoSubject[]> {
  const connection = process.env.DATABASE_URL;
  if (!connection || !["localhost", "127.0.0.1", "[::1]"].includes(URL.parse(connection)?.hostname ?? "")) {
    throw new Error("DATABASE_URL must point to local Postgres");
  }
  const client = new pg.Client({ connectionString: connection, options: "-c default_transaction_read_only=on",
    connectionTimeoutMillis: 5000 });
  try {
    await client.connect();
    const { rows } = await client.query<CatalogPhotoSubject>(`
      SELECT id, kind, name, aliases, province, prefecture, county, summary
      FROM catalog_entries
      WHERE kind IN ('spot', 'dish')
        AND (cardinality($1::text[]) = 0 OR (province || '/' || prefecture) = ANY($1))
        AND ($2::text IS NULL OR kind = $2)
      ORDER BY kind DESC, id
    `, [cities, kind ?? null]);
    return rows;
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    const safeCode = typeof code === "string" && /^[A-Z0-9_]+$/u.test(code) ? ` (${code})` : "";
    throw new Error(`Could not read catalog_entries from local Postgres${safeCode}`);
  } finally {
    await client.end();
  }
}

function pacedClient(): WikimediaClient {
  let nextRequest = 0;
  return new WikimediaClient({ fetcher: async (url, init) => {
    // The shared client rejects once its 40/minute budget is spent. Pace actual HTTP calls,
    // including redirects and Commons requests, so a normal run never hits that ceiling.
    await sleep(Math.max(0, nextRequest - performance.now()), undefined, { signal: init?.signal ?? undefined });
    nextRequest = performance.now() + 3000;
    const response = await fetch(url, init);
    if (!response.ok && (response.status < 300 || response.status >= 400)) {
      const retryAfter = response.headers.get("retry-after");
      const cooldown = retryAfter && (response.status === 429 || response.status === 503)
        ? ` (Retry-After: ${retryAfter})` : "";
      process.stderr.write(`Wikimedia HTTP ${response.status}${cooldown}\n`);
    }
    if (response.status === 503 && response.headers.has("retry-after")) {
      await response.body?.cancel().catch(() => undefined);
      return new Response(null, { status: 429, headers: response.headers });
    }
    return response;
  } });
}

async function lookUp(client: WikimediaClient, subject: CatalogPhotoSubject): Promise<Lookup> {
  const query = photoQuery(subject);
  if (!query) return { rejection: { reason: "no_wikidata" } };
  const answer = await client.query(query);
  if (!answer.ok) return { operation: "Wikidata query", unavailable: answer.failure };
  const images = photoCandidates(answer.rows, subject);
  if (images.length === 0) return { rejection: { reason: "no_wikidata" } };

  const described = await client.files(images.map(({ file }) => file));
  if (!described.ok) return { operation: "Commons metadata", unavailable: described.failure };
  const width = photoWidth(subject.kind);
  const picked = pickCandidate(images, described.files, width);
  if ("rejection" in picked) return picked;

  const downloaded = await client.download(picked.candidate.file.thumbUrl);
  if (!downloaded.ok) {
    if (downloaded.failure === "unsuitable") return { rejection: { reason: "review", detail: "unsuitable_download" } };
    return { operation: "Commons download", unavailable: downloaded.failure };
  }

  try {
    const input = sharp(downloaded.body);
    const { format, autoOrient, pages } = await input.metadata();
    if (!format || !["jpeg", "png", "webp"].includes(format) || (pages ?? 1) > 1) {
      return { rejection: { reason: "review", detail: "unsupported_image" } };
    }
    if (autoOrient.width < width) return { rejection: { reason: "too_small" } };
    const { data, info } = await input.autoOrient().resize({ width, withoutEnlargement: true })
      .avif({ quality: 50 }).toBuffer({ resolveWithObject: true });
    return { photo: manifestEntry(subject.id, picked.candidate, info, new Date()), body: data };
  } catch {
    return { rejection: { reason: "review", detail: "unreadable_image" } };
  }
}

async function readOptional(path: string, fallback: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return fallback;
  }
}

async function writeAtomic(path: string, body: string | Buffer): Promise<void> {
  const temp = `${path}.tmp`;
  try {
    await writeFile(temp, body);
    await rename(temp, path);
  } finally {
    await rm(temp, { force: true });
  }
}

async function writeManifest(manifest: Manifest): Promise<void> {
  const sorted = Object.fromEntries(Object.keys(manifest).sort().map((id) => [id, manifest[id]]));
  await writeAtomic(manifestPath, `${JSON.stringify(sorted, null, 2)}\n`);
}

function escapeHtml(value: string): string {
  return value.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;");
}

async function writeReview(subjects: readonly CatalogPhotoSubject[], manifest: Manifest): Promise<void> {
  const cards = [];
  for (const { id, name, prefecture, county, summary } of subjects) {
    const photo = manifest[id];
    if (!photo) continue;
    const image = await readFile(join(photoDir, photoFilename(id)), "base64");
    cards.push(`<article><img src="data:image/avif;base64,${image}" alt="${escapeHtml(name)}">
      <h2>${escapeHtml(name)}</h2><p>${escapeHtml([prefecture, county].filter(Boolean).join(" · "))}</p>
      <p>${escapeHtml(summary)}</p><p><a href="${escapeHtml(photo.sourceUrl)}">${escapeHtml(photo.title)}</a></p>
      <code>${id}</code></article>`);
  }
  await writeAtomic(reviewPath, `<!doctype html><html lang="zh-CN"><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1"><title>目录照片审核</title>
    <style>body{font:16px system-ui;margin:24px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:20px}
    article{border:1px solid #ccc;padding:16px;overflow-wrap:anywhere}img{max-width:100%;height:auto}h2{font-size:1.2em}</style>
    <h1>目录照片审核（${cards.length} 张）</h1><main>${cards.join("\n")}</main></html>\n`);
}

async function run(subjects: readonly CatalogPhotoSubject[], manifest: Manifest, rejectedIds: readonly string[]): Promise<void> {
  const previous = await readOptional(rejectedPath, "");
  const rejected = new Map<string, RejectedPhoto>();
  for (const line of previous.split("\n").filter(Boolean)) {
    const row: RejectedPhoto = JSON.parse(line);
    rejected.set(row.id, row);
  }
  const client = pacedClient();
  const start = performance.now();
  let stop: { operation: string; reason: WikimediaFailure } | undefined;
  let unavailable = 0;
  let completed = 0;
  const reviewSubjects = rejectedIds.map((id) => {
    const subject = subjects.find((entry) => entry.id === id);
    if (!subject || !manifest[id]) throw new Error("Review rejection must name a saved photo in the selected cities");
    return subject;
  });

  try {
    if (reviewSubjects.length > 0) {
      for (const { id, name } of reviewSubjects) {
        rejected.set(id, { id, name, reason: "review", detail: "visual_review" });
        delete manifest[id];
      }
      await writeManifest(manifest);
      for (const { id } of reviewSubjects) await rm(join(photoDir, photoFilename(id)), { force: true });
      return;
    }

    const pending = subjects.filter(({ id }) => !manifest[id] && !rejected.has(id));
    process.stdout.write(`${JSON.stringify({ total: subjects.length, pending: pending.length })}\n`);
    for (const subject of pending) {
      const { id, name } = subject;
      const filename = photoFilename(id);
      const result = await lookUp(client, subject);
      if ("unavailable" in result) {
        unavailable += 1;
        process.stderr.write(`${id} ${result.operation}: ${result.unavailable}\n`);
        if (result.unavailable !== "transient") {
          stop = { operation: result.operation, reason: result.unavailable };
          break;
        }
        // WDQS can continue processing after the client times out. Let the server's
        // 60-second query window clear before sending the next subject.
        if (result.operation === "Wikidata query") await sleep(65_000);
        continue;
      }

      if ("rejection" in result) {
        const row = { id, name, ...result.rejection };
        await appendFile(rejectedPath, `${JSON.stringify(row)}\n`);
        rejected.set(id, row);
      } else {
        await mkdir(photoDir, { recursive: true });
        await writeAtomic(join(photoDir, filename), result.body);
        manifest[id] = result.photo;
        await writeManifest(manifest);
      }

      completed += 1;
      if (completed % 25 === 0) {
        process.stdout.write(`${JSON.stringify({ completed, unavailable, pending: pending.length - completed })}\n`);
      }
    }
  } finally {
    const counts = { no_wikidata: 0, licence: 0, no_author: 0, too_small: 0, review: 0 };
    let saved = 0;
    let visualRejected = 0;
    let bytes = 0;
    for (const { id } of subjects) {
      if (manifest[id]) {
        saved += 1;
        bytes += (await stat(join(photoDir, photoFilename(id)))).size;
      } else {
        const refusal = rejected.get(id);
        if (refusal) counts[refusal.reason] += 1;
        if (refusal?.detail === "visual_review") visualRejected += 1;
      }
    }
    const lines = [...rejected.values()].map((row) => `${JSON.stringify(row)}\n`).join("");
    await writeAtomic(rejectedPath, lines);
    await writeReview(subjects, manifest);
    process.stdout.write(`${JSON.stringify({ total: subjects.length, saved, bytes, skipped: counts, visualRejected, unavailable,
      pending: subjects.length - saved - Object.values(counts).reduce((sum, count) => sum + count, 0),
      seconds: Number(((performance.now() - start) / 1000).toFixed(3)), stop })}\n`);
    if (unavailable > 0) process.exitCode = 1;
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { city: { type: "string", multiple: true }, kind: { type: "string" },
    "dry-run": { type: "boolean" },
    "reject-review": { type: "string", multiple: true } } });
  const cities = values.city ?? [];
  if (cities.some((city) => !/^[^/\s]+\/[^/\s]+$/u.test(city))) throw new Error("Use --city 省/市 or --city 省/州");
  const rejectedIds = [...new Set(values["reject-review"] ?? [])];
  if (values["dry-run"] && rejectedIds.length > 0) throw new Error("Choose --dry-run or --reject-review");
  const kind = values.kind;
  if (kind !== undefined && kind !== "spot" && kind !== "dish") throw new Error("Use --kind spot or --kind dish");
  const subjects = await loadSubjects(cities, kind);
  const foundCities = new Set(subjects.map(({ province, prefecture }) => `${province}/${prefecture}`));
  if (cities.some((city) => !foundCities.has(city))) throw new Error("A selected city has no spots or dishes in catalog_entries");
  if (values["dry-run"]) {
    const spots = subjects.filter(({ kind }) => kind === "spot").length;
    process.stdout.write(`${JSON.stringify({ total: subjects.length, spots, dishes: subjects.length - spots })}\n`);
    return;
  }

  await mkdir(cacheDir, { recursive: true });
  const lockPath = join(cacheDir, "fetch.lock");
  const lock = await open(lockPath, "wx");
  try {
    const manifest: Manifest = Object.assign(Object.create(null), JSON.parse(await readOptional(manifestPath, "{}")));
    await run(subjects, manifest, rejectedIds);
  } finally {
    await lock.close();
    await rm(lockPath);
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
