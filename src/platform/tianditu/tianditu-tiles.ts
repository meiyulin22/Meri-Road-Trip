import type { MapTile } from "@/domain/map/map-tile";
import { createPacer, type Gate } from "@/platform/http/request-pacer";
import { logger } from "@/platform/observability/logger";

export type TileAnswer =
  | { readonly ok: true; readonly body: ArrayBuffer; readonly contentType: string }
  | { readonly ok: false; readonly reason: "missing_configuration" | "refused" | "paused" | "http_error" | "timeout" | "network_error" };

/**
 * After Tianditu refuses one tile (its firewall's 418, or its HTML block page), the relay
 * stops asking for a while: a screen of tiles would otherwise hit the wall dozens of times,
 * against the rule that a failed Tianditu call is never followed by more of the same.
 */
export const refusalPauseMs = 5 * 60 * 1_000;

/**
 * Tiles leave the server one at a time, a short gap apart: a screen of a dozen tiles from one
 * address at once looks like a crawler to Tianditu's firewall, which refused a burst on
 * 2026-11-16 (a browser spreads the same load over many visitors). Its own queue, apart from
 * the search queue, so a map never slows a place lookup.
 */
export const tileIntervalMs = 120;

export function tiandituTileUrl({ layer, z, x, y }: MapTile, key: string): string {
  return `https://t${(x + y) % 8}.tianditu.gov.cn/${layer}_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0`
    + `&LAYER=${layer}&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX=${z}&TILEROW=${y}&TILECOL=${x}`
    + `&tk=${encodeURIComponent(key)}`;
}

/**
 * Fetches tiles with the server's key (TIANDITU_API_KEY), which never reaches the browser.
 * Nothing is stored on the server; a refusal pauses every request for `refusalPauseMs`.
 */
export function createTiandituTileFetcher(
  fetcher: typeof fetch = fetch,
  now: () => number = Date.now,
  gate: Gate = createPacer(tileIntervalMs),
) {
  let pausedUntil = 0;
  return async (tile: MapTile): Promise<TileAnswer> => {
    const key = process.env.TIANDITU_API_KEY?.trim();
    if (!key) return { ok: false, reason: "missing_configuration" };
    if (now() < pausedUntil) return { ok: false, reason: "paused" };
    try {
      // Checked again after the wait: a refusal while this tile queued pauses it too.
      const response = await gate.run(async () => {
        if (now() < pausedUntil) return null;
        return fetcher(tiandituTileUrl(tile, key), {
          // Tianditu's firewall refuses requests without a browser-like User-Agent.
          headers: { "User-Agent": "Mozilla/5.0 (compatible; Meri)" },
          cache: "no-store",
          signal: AbortSignal.timeout(8_000),
        });
      });
      if (!response) return { ok: false, reason: "paused" };
      const contentType = response.headers.get("content-type") ?? "";
      if (response.status === 418 || contentType.includes("text/html")) {
        pausedUntil = now() + refusalPauseMs;
        logger.warn({ statusCode: response.status, pauseMs: refusalPauseMs }, "Tianditu refused a map tile; the tile relay pauses");
        return { ok: false, reason: "refused" };
      }
      if (!response.ok || !contentType.startsWith("image/")) return { ok: false, reason: "http_error" };
      return { ok: true, body: await response.arrayBuffer(), contentType };
    } catch (error) {
      // The URL holds the key: keep only a reason.
      const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      return { ok: false, reason: timedOut ? "timeout" : "network_error" };
    }
  };
}
