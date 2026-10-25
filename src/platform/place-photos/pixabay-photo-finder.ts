import { placePhotoRulesVersion, type PlaceImage } from "@/domain/location/place-image";
import { logEvents, logger } from "@/platform/observability/logger";

import { readImageFacts } from "./image-file";
import { mediaPhotoUrlPrefix, type MediaPhotoStore, type StoredPhotoRecord } from "./media-photo-store";
import type { PixabayClient, PixabayFailure } from "./pixabay-client";
import {
  assessHits,
  pixabayArtistUrl,
  searchVariants,
  type PixabayHit,
  type RejectionReason,
  type RemotePhotoSubject,
  type SearchVariant,
} from "./pixabay-photo-match";
import type { RemotePhotoFinder, RemotePhotoResult } from "./remote-photo-finder";

export type { RemotePhotoFinder, RemotePhotoResult, RemotePhotoSubject } from "./remote-photo-finder";

/**
 * What one set of cards may spend. Shared by every card in the set, so ten cards cannot
 * add up to ten cards' worth of searches, and stopped for all of them at the first sign
 * the API will not answer (a refused key, a rate limit).
 */
export interface RemoteBatch {
  searchesLeft: number;
  downloadsLeft: number;
  readonly deadline: number;
  stopped: PixabayFailure | null;
}

export interface PixabayPhotoFinderOptions {
  readonly client: PixabayClient;
  readonly store: MediaPhotoStore;
  readonly now?: () => number;
}

/**
 * One set of cards (up to 12) costs at most 20 searches and 10 downloads: 30 requests,
 * well inside Pixabay's 100 a minute, and the client's own limiter (80 a minute) holds
 * the line when several sets run at once. A card past the budget is asked again later.
 */
const batchSearches = 20;
const batchDownloads = 10;
const batchDurationMs = 45_000;
/** Downloads one landmark may spend across all its searches, so one card cannot use up a set's budget. */
const downloadsPerLookup = 2;
/** A lookup that could not finish is not tried again for this long, however often the page reloads. */
const retryAfterMs = 10 * 60 * 1000;
const pauseAfterRateLimitMs = 60 * 1000;
const pauseAfterRefusalMs = 15 * 60 * 1000;
const minimumBytes = 10 * 1024;


/**
 * Finds a recommendation card's photo on Pixabay when the bundled catalog has none:
 * the runtime store first (no request), then a few bounded searches, a strict
 * reading of each hit's tags, a checked download, and publication into the store.
 * Lookups for the same landmark in the same region share one operation while it runs.
 */
export class PixabayPhotoFinder implements RemotePhotoFinder<RemoteBatch> {
  private readonly now: () => number;
  private readonly inFlight = new Map<string, Promise<RemotePhotoResult>>();
  private readonly retryAt = new Map<string, number>();
  private pausedUntil = 0;

  constructor(private readonly options: PixabayPhotoFinderOptions) {
    this.now = options.now ?? Date.now;
  }

  startBatch(): RemoteBatch {
    return { searchesLeft: batchSearches, downloadsLeft: batchDownloads, deadline: this.now() + batchDurationMs, stopped: null };
  }

  async find(subject: RemotePhotoSubject, batch: RemoteBatch): Promise<RemotePhotoResult> {
    const key = { region: subject.region, landmark: subject.landmark };
    const stored = await this.options.store.readLookup(key);
    if (stored) return { status: "found", image: stored };
    if (await this.options.store.recentlyNone(key, this.now(), placePhotoRulesVersion, "pixabay")) return { status: "none" };
    const text = `${subject.region}|${subject.landmark}`;
    const running = this.inFlight.get(text);
    if (running) return running;
    if (this.now() < this.pausedUntil) return { status: "unavailable", reason: "paused" };
    if (this.now() < (this.retryAt.get(text) ?? 0)) return { status: "unavailable", reason: "retry_later" };
    const lookup = this.lookUp(subject, batch).then((result) => {
      if (result.status === "unavailable") {
        if (this.retryAt.size > 1000) this.retryAt.clear();
        this.retryAt.set(text, this.now() + retryAfterMs);
      }
      return result;
    }).finally(() => this.inFlight.delete(text));
    this.inFlight.set(text, lookup);
    return lookup;
  }

  private async lookUp(subject: RemotePhotoSubject, batch: RemoteBatch): Promise<RemotePhotoResult> {
    const searches: { q: string; lang: string; hits: number; cached: boolean }[] = [];
    const rejected: Partial<Record<RejectionReason, number>> = {};
    let rejectedFiles = 0;
    const result = await this.searchAndAdopt(subject, batch, searches, rejected, () => { rejectedFiles += 1; });
    const summary = { region: subject.region, landmark: subject.landmark, searches, rejected, rejectedFiles };
    logger.info({ event: result.status === "unavailable" ? logEvents.placePhotoRemoteUnavailable : logEvents.placePhotoRemoteCompleted,
      ...summary, status: result.status, ...(result.status === "unavailable" ? { reason: result.reason } : {}),
      ...(result.status === "found" ? { url: result.image.url } : {}) }, "Remote place photo lookup finished");
    if (result.status === "none") {
      // Every answer it rests on is cached for the day, so asking again today under the same rules would decide the same.
      await this.options.store.writeNone(subject, this.now(), placePhotoRulesVersion, "pixabay").catch(() => undefined);
      await this.options.store.recordMiss({ province: subject.province, ...summary }, this.now()).catch(() => undefined);
    }
    return result;
  }

  private async searchAndAdopt(subject: RemotePhotoSubject, batch: RemoteBatch,
    searches: { q: string; lang: string; hits: number; cached: boolean }[],
    rejected: Partial<Record<RejectionReason, number>>, onRejectedFile: () => void): Promise<RemotePhotoResult> {
    let unavailable: string | null = null;
    let downloads = 0;
    const tried = new Set<number>();
    for (const query of searchVariants(subject)) {
      const searched = await this.search(query, batch);
      if ("unavailable" in searched) return { status: "unavailable", reason: searched.unavailable };
      searches.push({ q: query.q, lang: query.lang, hits: searched.hits.length, cached: searched.cached });
      const assessment = assessHits(searched.hits, subject);
      for (const [reason, count] of Object.entries(assessment.rejected) as [RejectionReason, number][]) {
        rejected[reason] = (rejected[reason] ?? 0) + count;
      }
      for (const { hit, matched } of assessment.accepted) {
        if (tried.has(hit.id)) continue;
        if (downloads >= downloadsPerLookup) break;
        tried.add(hit.id);
        downloads += 1;
        const outcome = await this.adopt(hit, matched, `${query.q} [${query.lang}]`, subject, batch);
        if (outcome.status === "found") return outcome;
        if (outcome.status === "none") onRejectedFile();
        if (outcome.status === "unavailable") {
          unavailable = outcome.reason;
          if (batch.stopped || outcome.reason === "storage_full" || outcome.reason === "batch_budget") return outcome;
        }
      }
      // A candidate that failed to download is a reason to try later, not to search wider.
      if (unavailable || downloads >= downloadsPerLookup) break;
    }
    return unavailable ? { status: "unavailable", reason: unavailable } : { status: "none" };
  }

  private stop(batch: RemoteBatch, failure: PixabayFailure): void {
    batch.stopped = failure;
    const pause = failure === "refused" ? pauseAfterRefusalMs : pauseAfterRateLimitMs;
    this.pausedUntil = Math.max(this.pausedUntil, this.now() + pause);
  }

  private async search(query: SearchVariant, batch: RemoteBatch):
    Promise<{ hits: readonly PixabayHit[]; cached: boolean } | { unavailable: string }> {
    // Fifty a page: one request sees more candidates for the same quota.
    const parameters = new URLSearchParams({ q: query.q, lang: query.lang, image_type: "photo",
      orientation: "horizontal", safesearch: "true", per_page: "50" }).toString();
    const cached = await this.options.store.readSearch(parameters, this.now());
    if (cached) return { hits: cached, cached: true };
    if (batch.stopped) return { unavailable: batch.stopped };
    if (this.now() < this.pausedUntil) return { unavailable: "paused" };
    if (batch.searchesLeft <= 0 || this.now() >= batch.deadline) return { unavailable: "batch_budget" };
    batch.searchesLeft -= 1;
    const outcome = await this.options.client.search(new URLSearchParams(parameters));
    if (!outcome.ok) {
      if (outcome.failure !== "transient") this.stop(batch, outcome.failure);
      return { unavailable: outcome.failure };
    }
    // Empty answers are cached too: asking again within the day would spend quota on the same nothing.
    await this.options.store.writeSearch(parameters, outcome.hits, this.now());
    return { hits: outcome.hits, cached: false };
  }

  private async adopt(hit: PixabayHit, matched: readonly string[], query: string, subject: RemotePhotoSubject,
    batch: RemoteBatch): Promise<RemotePhotoResult> {
    if (!hit.pageURL.startsWith("https://pixabay.com/") || !hit.user.trim()) return { status: "none" };
    if (batch.stopped) return { status: "unavailable", reason: batch.stopped };
    if (batch.downloadsLeft <= 0 || this.now() >= batch.deadline) return { status: "unavailable", reason: "batch_budget" };
    batch.downloadsLeft -= 1;
    // The 640-pixel link the search returned: enough for a card. It expires within a day,
    // which is why the file is kept and the link is not. (The `_960` swap Pixabay documents
    // answers HTTP 400 on these /get/ links — measured 2026-10-24.)
    const downloaded = await this.options.client.download(hit.webformatURL);
    if (!downloaded.ok) {
      if (downloaded.failure === "unsuitable") return { status: "none" };
      if (downloaded.failure !== "transient") this.stop(batch, downloaded.failure);
      return { status: "unavailable", reason: downloaded.failure };
    }
    const facts = readImageFacts(downloaded.body);
    const declared = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[downloaded.contentType];
    if (!facts || facts.format !== declared || facts.width < 480 || facts.height < 320 ||
      downloaded.body.byteLength < minimumBytes) return { status: "none" };
    const file = `pixabay-${hit.id}.${facts.format}`;
    const image: PlaceImage = { url: `${mediaPhotoUrlPrefix}${file}`, caption: subject.landmark.slice(0, 60),
      credit: `Photo: ${hit.user.trim().slice(0, 80)} / Pixabay` };
    const artistUrl = pixabayArtistUrl(hit);
    const record: StoredPhotoRecord = { source: "pixabay", id: hit.id, file, format: facts.format,
      width: facts.width, height: facts.height, bytes: downloaded.body.byteLength, artist: hit.user,
      ...(artistUrl ? { artistUrl } : {}),
      pageUrl: hit.pageURL, tags: hit.tags, query, matched, province: subject.province, region: subject.region,
      landmark: subject.landmark, reviewed: false, fetchedAt: new Date(this.now()).toISOString() };
    let published: "published" | "full";
    try {
      published = await this.options.store.publish(record, downloaded.body);
      if (published === "published") await this.options.store.writeLookup(subject, file, image);
    } catch {
      return { status: "unavailable", reason: "storage_error" };
    }
    if (published === "full") return { status: "unavailable", reason: "storage_full" };
    return { status: "found", image };
  }
}
