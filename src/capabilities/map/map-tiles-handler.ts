import { parseMapTile, type MapTile } from "@/domain/map/map-tile";
import type { TileAnswer } from "@/platform/tianditu/tianditu-tiles";
import { clientAddress } from "@/platform/http/client-address";

export type MapTileDependencies = {
  readonly fetchTile: (tile: MapTile) => Promise<TileAnswer>;
  readonly limiter: { allow(client: string): boolean };
};

/** One visitor scrolling a map needs far fewer; a script draining the quota hits this. */
export const tilesPerMinute = 400;

/**
 * Whether the request comes from one of Meri's own pages. Browsers say so in Sec-Fetch-Site
 * and in Referer; a script can fake both, so this only stops casual reuse of the relay in other
 * sites. The China-only tiles and the per-address limit do the real work.
 */
export function fromOwnPage(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site !== null) return site === "same-origin";
  const referer = request.headers.get("referer");
  if (!referer) return false;
  try {
    return new URL(referer).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

// One rule for every per-address limit since step 3: a header only a trusted proxy writes.
export { clientAddress };

function plain(status: number, message: string): Response {
  return new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

/**
 * Relays one Tianditu tile to Meri's map (1.2104). The browser never sees a key: it asks this
 * route, which asks Tianditu with the server's key and passes the image on. Nothing is stored on
 * the server; the browser may keep a tile for a day.
 */
export async function handleMapTileGet(
  request: Request,
  params: { layer: string; z: string; x: string; y: string },
  deps: MapTileDependencies,
): Promise<Response> {
  if (!fromOwnPage(request)) return plain(403, "Map tiles are only served to Meri's pages.");
  const tile = parseMapTile(params);
  if (!tile) return plain(404, "No such map tile.");
  if (!deps.limiter.allow(clientAddress(request))) return plain(429, "Too many map tiles; try again in a minute.");
  const answer = await deps.fetchTile(tile);
  if (!answer.ok) {
    return plain(answer.reason === "missing_configuration" ? 503 : 502, "The map is unavailable right now.");
  }
  return new Response(answer.body, {
    status: 200,
    headers: { "Content-Type": answer.contentType, "Cache-Control": "private, max-age=86400" },
  });
}
