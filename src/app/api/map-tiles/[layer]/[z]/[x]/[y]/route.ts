import { handleMapTileGet, tilesPerMinute } from "@/capabilities/map/map-tiles-handler";
import { createRateLimiter } from "@/platform/http/rate-limiter";
import { createTiandituTileFetcher } from "@/platform/tianditu/tianditu-tiles";

type Context = { params: Promise<{ layer: string; z: string; x: string; y: string }> };

// One relay and one limiter per server process, so the refusal pause and the counts are shared.
const fetchTile = createTiandituTileFetcher();
const limiter = createRateLimiter({ limit: tilesPerMinute, windowMs: 60_000 });

export async function GET(request: Request, context: Context): Promise<Response> {
  return handleMapTileGet(request, await context.params, { fetchTile, limiter });
}
