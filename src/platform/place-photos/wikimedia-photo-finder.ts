import { placePhotoRulesVersion, type PlaceImage } from "@/domain/location/place-image";
import { logEvents, logger } from "@/platform/observability/logger";

import { readImageFacts } from "./image-file";
import { mediaPhotoUrlPrefix, type MediaPhotoStore, type WikimediaPhotoRecord } from "./media-photo-store";
import { catalogCredit } from "./photo-catalog";
import { regionShortName } from "./photo-regions";
import type { RemotePhotoFinder, RemotePhotoResult, RemotePhotoSubject } from "./remote-photo-finder";
import type { CommonsFile, SparqlRow, WikimediaClient, WikimediaFailure } from "./wikimedia-client";

/**
 * What one set of cards may spend on Wikimedia, shared by every card in it and stopped
 * for all of them at the first refusal or rate limit. The deadline is short because
 * Pixabay waits behind it: a card's Pixabay search starts only once Wikimedia has answered.
 */
export interface WikimediaBatch {
  queriesLeft: number;
  filesLeft: number;
  downloadsLeft: number;
  readonly deadline: number;
  stopped: WikimediaFailure | null;
}

export interface WikimediaPhotoFinderOptions {
  readonly client: WikimediaClient;
  readonly store: MediaPhotoStore;
  readonly now?: () => number;
}

/**
 * One set of cards (up to 12, two landmarks each) costs at most 12 Wikidata queries, 8
 * Commons queries and 8 downloads: 28 requests, inside the client's 40 a minute.
 */
const batchQueries = 12;
const batchFiles = 8;
const batchDownloads = 8;
const batchDurationMs = 25_000;
/** Distinct P18 images one landmark may try when the first is refused (licence, size). */
const filesPerLookup = 2;
/**
 * No answer at all is what a server in mainland China always gets: Wikimedia is paused
 * for the whole process, so such a server spends one timed-out request every ten minutes
 * and sends every card straight on to Pixabay the rest of the time.
 */
const pauseAfterNoAnswerMs = 10 * 60 * 1000;
const pauseAfterRateLimitMs = 60 * 1000;
const pauseAfterRefusalMs = 15 * 60 * 1000;
const minimumBytes = 10 * 1024;

/**
 * The licences whose terms the credit line and /photo-credits meet: Creative Commons BY
 * and BY-SA (any version or port), CC0 and public domain. Anything else — GFDL-only, a
 * licence Commons names oddly, no licence — is passed over, and Pixabay is asked instead.
 */
const freeLicence = /^(?:CC BY(?:-SA)? [1-4]\.0(?: [a-z-]{2,10})?|CC0(?: 1\.0)?|Public domain)$/iu;
const openLicence = /^(?:CC0(?: 1\.0)?|Public domain)$/iu;
const photoMimes = new Set(["image/jpeg", "image/png", "image/webp", "image/tiff"]);

/** A model-written name inside a SPARQL string literal: no quote, backslash or line break can end it. */
export function literal(text: string): string {
  return `"${text.replace(/[\\"]/gu, "\\$&").replace(/[\r\n\t]/gu, " ")}"`;
}

function namesOf(subject: RemotePhotoSubject): { chinese: string[]; latin: string[] } {
  const all = [subject.landmark, subject.english ?? "", ...(subject.aliases ?? [])]
    .map((name) => name.normalize("NFKC").trim()).filter((name) => name.length >= 2 && name.length <= 60);
  const unique = [...new Set(all)];
  const cjk = /[\u3400-\u9fff]/u;
  return { chinese: unique.filter((name) => cjk.test(name)), latin: unique.filter((name) => !cjk.test(name)) };
}

/**
 * Items named like the landmark — label or alias, in Chinese or English — that lie in
 * the card's 市 by Wikidata's own "located in" chain (P131, followed upwards), and have an
 * image (P18). The 市 is itself pinned to its province, so neither the landmark nor a short
 * 市 name can land on a namesake elsewhere: 西湖 in 惠州市 is not 西湖 in 杭州市.
 * A 直辖市 is its own province, so only its name is asked.
 */
export function landmarkQuery(subject: RemotePhotoSubject): string | null {
  const { chinese, latin } = namesOf(subject);
  if (chinese.length === 0 && latin.length === 0) return null;
  const names = [chineseLiterals(chinese), ...latin.map((name) => `${literal(name)}@en`)].filter(Boolean).join(" ");
  const regions = chineseLiterals([subject.region, regionShortName(subject.region)]);
  const municipality = regionShortName(subject.region) === regionShortName(subject.province);
  const province = municipality ? ""
    : `?region wdt:P131 ?province. VALUES ?provinceName { ${chineseLiterals([subject.province])} } ?province rdfs:label ?provinceName.`;
  return `SELECT DISTINCT ?item ?image ?name ?rank WHERE {
  VALUES ?name { ${names} }
  { ?item rdfs:label ?name. BIND(1 AS ?rank) } UNION { ?item skos:altLabel ?name. BIND(2 AS ?rank) }
  ?item wdt:P18 ?image.
  VALUES ?regionName { ${regions} }
  ?region rdfs:label ?regionName.
  ${province}
  ?item wdt:P131+ ?region.
} LIMIT 40`;
}

/**
 * Chinese names in each tag Wikidata files Chinese labels under. Many items carry their
 * label only as zh-hans or zh-cn, not plain zh: 镇江市 (Q57958) does, which is why the
 * 1.0632 catalog query, asking for @zh alone, never found it.
 */
export function chineseLiterals(names: readonly string[]): string {
  return [...new Set(names.map((name) => name.normalize("NFKC").trim()).filter(Boolean))]
    .flatMap((name) => ["zh", "zh-hans", "zh-cn"].map((tag) => `${literal(name)}@${tag}`)).join(" ");
}

export interface LandmarkImage {
  readonly item: string;
  /** The Commons file name, without "File:". */
  readonly file: string;
  readonly matched: string;
}

/**
 * The images to try, best first: an item whose label is the landmark's own Chinese name,
 * then one matched by label in another form, then by alias; among equals the older item
 * (the lower Q-id), which is usually the main article rather than a later duplicate.
 */
export function rankedImages(rows: readonly SparqlRow[], subject: RemotePhotoSubject): LandmarkImage[] {
  const own = subject.landmark.normalize("NFKC").trim();
  const scored = rows.flatMap((row) => {
    const item = /\/entity\/(Q\d+)$/u.exec(row.item ?? "")?.[1];
    const file = row.image ? decodeURIComponent(row.image.split("/").pop() ?? "") : "";
    if (!item || !file || !row.name) return [];
    const score = (row.rank === "1" ? 0 : 2) + (row.name === own ? 0 : 1);
    return [{ item, file, matched: row.name, score, number: Number(item.slice(1)) }];
  }).sort((left, right) => left.score - right.score || left.number - right.number);
  const seen = new Set<string>();
  return scored.filter((image) => !seen.has(image.file) && seen.add(image.file))
    .map(({ item, file, matched }) => ({ item, file, matched }));
}

/**
 * Why Meri may not use a Commons file at all — its licence, author or kind — or null. The
 * catalog script applies only this: a person reviewing the photo judges its shape.
 */
export function usageRefusalOf(file: CommonsFile): string | null {
  if (file.nonFree || !freeLicence.test(file.license)) return "licence";
  if (!openLicence.test(file.license) && !file.artist) return "no_author";
  if (!openLicence.test(file.license) && !file.licenseUrl.startsWith("https://creativecommons.org/")) return "licence_link";
  if (!photoMimes.has(file.mime)) return "not_a_photo";
  if (!file.pageUrl.startsWith("https://commons.wikimedia.org/wiki/File:")) return "page";
  return null;
}

/** Why a Commons file is passed over for a card no one reviews, or null when its licence, author and shape will do. */
export function refusalOf(file: CommonsFile): string | null {
  // Cards are landscape, like Pixabay's horizontal filter.
  return usageRefusalOf(file) ?? (file.width <= file.height || file.width < 800 ? "shape" : null);
}

/**
 * Finds a recommendation card's photo through Wikidata before Pixabay is asked: the
 * landmark's item, matched by name and located in the card's 市, and its P18 image on
 * Commons. Identity comes from Wikidata's own statements, not from tags, so there is
 * no guessing; what remains to check is the licence and the file. The answer is kept
 * in the same media store as Pixabay's, with its author and licence.
 */
export class WikimediaPhotoFinder implements RemotePhotoFinder<WikimediaBatch> {
  private readonly now: () => number;
  private readonly inFlight = new Map<string, Promise<RemotePhotoResult>>();
  private pausedUntil = 0;

  constructor(private readonly options: WikimediaPhotoFinderOptions) {
    this.now = options.now ?? Date.now;
  }

  startBatch(): WikimediaBatch {
    return { queriesLeft: batchQueries, filesLeft: batchFiles, downloadsLeft: batchDownloads,
      deadline: this.now() + batchDurationMs, stopped: null };
  }

  async find(subject: RemotePhotoSubject, batch: WikimediaBatch): Promise<RemotePhotoResult> {
    const key = { region: subject.region, landmark: subject.landmark };
    const stored = await this.options.store.readLookup(key);
    if (stored) return { status: "found", image: stored };
    if (await this.options.store.recentlyNone(key, this.now(), placePhotoRulesVersion, "wikimedia")) return { status: "none" };
    const text = `${subject.region}|${subject.landmark}`;
    const running = this.inFlight.get(text);
    if (running) return running;
    if (this.now() < this.pausedUntil) return { status: "unavailable", reason: "paused" };
    const lookup = this.lookUp(subject, batch).finally(() => this.inFlight.delete(text));
    this.inFlight.set(text, lookup);
    return lookup;
  }

  private async lookUp(subject: RemotePhotoSubject, batch: WikimediaBatch): Promise<RemotePhotoResult> {
    const refused: string[] = [];
    const result = await this.findImage(subject, batch, refused);
    logger.info({ event: result.status === "unavailable" ? logEvents.placePhotoRemoteUnavailable : logEvents.placePhotoRemoteCompleted,
      source: "wikimedia", region: subject.region, landmark: subject.landmark, status: result.status, refused,
      ...(result.status === "unavailable" ? { reason: result.reason } : {}),
      ...(result.status === "found" ? { url: result.image.url } : {}) }, "Wikimedia place photo lookup finished");
    if (result.status === "none") {
      await this.options.store.writeNone(subject, this.now(), placePhotoRulesVersion, "wikimedia").catch(() => undefined);
    }
    return result;
  }

  private async findImage(subject: RemotePhotoSubject, batch: WikimediaBatch, refused: string[]): Promise<RemotePhotoResult> {
    const sparql = landmarkQuery(subject);
    if (!sparql) return { status: "none" };
    const spent = this.spend(batch, "queriesLeft");
    if (spent) return spent;
    const answer = await this.options.client.query(sparql);
    if (!answer.ok) return this.fail(batch, answer.failure);
    for (const image of rankedImages(answer.rows, subject).slice(0, filesPerLookup)) {
      const result = await this.tryImage(image, subject, batch);
      if (result.status !== "none" || !("refused" in result)) return result;
      refused.push(`${image.item}:${result.refused}`);
    }
    return { status: "none" };
  }

  private async tryImage(image: LandmarkImage, subject: RemotePhotoSubject, batch: WikimediaBatch):
    Promise<RemotePhotoResult | { status: "none"; refused: string }> {
    const filesSpent = this.spend(batch, "filesLeft");
    if (filesSpent) return filesSpent;
    const described = await this.options.client.file(image.file);
    if (!described.ok) return this.fail(batch, described.failure);
    if (!described.file) return { status: "none", refused: "missing" };
    const refusal = refusalOf(described.file);
    if (refusal) return { status: "none", refused: refusal };
    const downloadsSpent = this.spend(batch, "downloadsLeft");
    if (downloadsSpent) return downloadsSpent;
    const downloaded = await this.options.client.download(described.file.thumbUrl);
    if (!downloaded.ok) {
      if (downloaded.failure === "unsuitable") return { status: "none", refused: "file" };
      return this.fail(batch, downloaded.failure);
    }
    const facts = readImageFacts(downloaded.body);
    const declared = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[downloaded.contentType];
    // A 500px rendition of a 16:9 photo is 281 high: the floor sits below that.
    if (!facts || facts.format !== declared || facts.width < 480 || facts.height < 270 ||
      downloaded.body.byteLength < minimumBytes) return { status: "none", refused: "file" };
    return this.publish(image, described.file, downloaded.body, facts, subject);
  }

  private async publish(image: LandmarkImage, file: CommonsFile, body: Uint8Array,
    facts: { format: "jpg" | "png" | "webp"; width: number; height: number }, subject: RemotePhotoSubject):
    Promise<RemotePhotoResult> {
    const name = `wikimedia-${file.pageId}.${facts.format}`;
    const artist = (file.artist || "Unknown author").slice(0, 100);
    // Public-domain files have no licence page; their Commons page states the status.
    const licenseUrl = file.licenseUrl.startsWith("https://") ? file.licenseUrl : file.pageUrl;
    const placeImage: PlaceImage = { url: `${mediaPhotoUrlPrefix}${name}`, caption: subject.landmark.slice(0, 60),
      credit: catalogCredit({ artist, source: "wikimedia", license: file.license }) };
    const record: WikimediaPhotoRecord = { source: "wikimedia", id: file.pageId, file: name, format: facts.format,
      width: facts.width, height: facts.height, bytes: body.byteLength, artist, pageUrl: file.pageUrl,
      title: file.title, item: image.item, matched: image.matched, license: file.license, licenseUrl,
      originalWidth: file.width, originalHeight: file.height, province: subject.province, region: subject.region,
      landmark: subject.landmark, reviewed: false, fetchedAt: new Date(this.now()).toISOString() };
    let published: "published" | "full";
    try {
      published = await this.options.store.publish(record, body);
      if (published === "published") await this.options.store.writeLookup(subject, name, placeImage);
    } catch {
      return { status: "unavailable", reason: "storage_error" };
    }
    if (published === "full") return { status: "unavailable", reason: "storage_full" };
    return { status: "found", image: placeImage };
  }

  /** Takes one request of a kind from the set's budget, or says why it cannot be made. */
  private spend(batch: WikimediaBatch, kind: "queriesLeft" | "filesLeft" | "downloadsLeft"): RemotePhotoResult | null {
    if (batch.stopped) return { status: "unavailable", reason: batch.stopped };
    if (this.now() < this.pausedUntil) return { status: "unavailable", reason: "paused" };
    if (batch[kind] <= 0 || this.now() >= batch.deadline) return { status: "unavailable", reason: "batch_budget" };
    batch[kind] -= 1;
    return null;
  }

  /** Any failure stops this set on Wikimedia and pauses it for the process; Pixabay is asked instead. */
  private fail(batch: WikimediaBatch, failure: WikimediaFailure): RemotePhotoResult {
    batch.stopped = failure;
    const pause = failure === "refused" ? pauseAfterRefusalMs : failure === "rate_limited" ? pauseAfterRateLimitMs : pauseAfterNoAnswerMs;
    this.pausedUntil = Math.max(this.pausedUntil, this.now() + pause);
    return { status: "unavailable", reason: failure };
  }
}
