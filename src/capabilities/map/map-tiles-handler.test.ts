import assert from "node:assert/strict";
import test from "node:test";

import { parseMapTile, touchesChina } from "@/domain/map/map-tile";
import { createRateLimiter } from "@/platform/http/rate-limiter";
import { createTiandituTileFetcher, refusalPauseMs, tiandituTileUrl } from "@/platform/tianditu/tianditu-tiles";

import { clientAddress, fromOwnPage, handleMapTileGet } from "./map-tiles-handler";

// Dali at zoom 13: column 6473, row 3487.
const dali = { layer: "vec", z: "13", x: "6473", y: "3487" };

test("only the three layers, sensible zooms and tiles touching China are relayed (1.2104)", () => {
  assert.deepEqual(parseMapTile(dali), { layer: "vec", z: 13, x: 6473, y: 3487 });
  assert.deepEqual(parseMapTile({ ...dali, layer: "cva", y: "3487.png" }), { layer: "cva", z: 13, x: 6473, y: 3487 });
  // English labels are not relayed while Tianditu refuses them.
  assert.equal(parseMapTile({ ...dali, layer: "eva" }), null);
  assert.equal(parseMapTile({ ...dali, layer: "img" }), null);
  assert.equal(parseMapTile({ ...dali, z: "19" }), null);
  assert.equal(parseMapTile({ ...dali, x: "-1" }), null);
  assert.equal(parseMapTile({ ...dali, x: "8192" }), null);
  // Paris at zoom 13 is no use to Meri.
  assert.equal(parseMapTile({ layer: "vec", z: "13", x: "4149", y: "2818" }), null);
  assert.equal(touchesChina({ z: 3, x: 6, y: 3 }), true);
});

test("the key stays on the server: tiles are asked for with it, and only the image is passed on", async () => {
  process.env.TIANDITU_API_KEY = "server-key";
  try {
    const tile = parseMapTile(dali)!;
    assert.match(tiandituTileUrl(tile, "server-key"), /^https:\/\/t0\.tianditu\.gov\.cn\/vec_w\/wmts\?.*TILEMATRIX=13&TILEROW=3487&TILECOL=6473&tk=server-key$/u);
    let time = 0;
    let calls = 0;
    const png = new Uint8Array([137, 80, 78, 71]).buffer;
    const answers = [() => new Response(png, { headers: { "content-type": "image/png" } }), () => new Response("<html>访问被拦截</html>", { headers: { "content-type": "text/html" } })];
    const fetchTile = createTiandituTileFetcher(async () => answers[Math.min(calls++, 1)](), () => time);
    const first = await fetchTile(tile);
    assert.equal(first.ok && first.contentType, "image/png");
    assert.deepEqual(await fetchTile(tile), { ok: false, reason: "refused" });
    // Refused once: the relay pauses rather than hit the wall again.
    assert.deepEqual(await fetchTile(tile), { ok: false, reason: "paused" });
    assert.equal(calls, 2);
    time = refusalPauseMs + 1;
    await fetchTile(tile);
    assert.equal(calls, 3);
  } finally {
    delete process.env.TIANDITU_API_KEY;
  }
});

test("each address gets a limited number of tiles a minute", () => {
  let time = 0;
  const limiter = createRateLimiter({ limit: 2, windowMs: 60_000, now: () => time });
  assert.deepEqual([limiter.allow("a"), limiter.allow("a"), limiter.allow("a"), limiter.allow("b")], [true, true, false, true]);
  time = 60_001;
  assert.equal(limiter.allow("a"), true);
});

test("tiles go only to Meri's own pages, within the limit, and say little when they fail", async () => {
  const own = (headers: Record<string, string>) => new Request("http://localhost:3000/api/map-tiles/vec/13/6473/3487", { headers });
  assert.equal(fromOwnPage(own({ "sec-fetch-site": "same-origin" })), true);
  assert.equal(fromOwnPage(own({ "sec-fetch-site": "cross-site" })), false);
  assert.equal(fromOwnPage(own({ referer: "http://localhost:3000/trips/x/plan" })), true);
  assert.equal(fromOwnPage(own({ referer: "https://elsewhere.example/" })), false);
  assert.equal(fromOwnPage(own({})), false);
  // The entry the nearest proxy appended, not one the client could have written (step 3).
  assert.equal(clientAddress(own({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" })), "10.0.0.1");
  assert.equal(clientAddress(own({ "x-forwarded-for": "1.2.3.4", "x-real-ip": "203.0.113.7" })), "203.0.113.7");
  // No CDN header is trusted: a client could send one to reset its limit.
  assert.equal(clientAddress(own({ "cf-connecting-ip": "198.51.100.9", "x-real-ip": "203.0.113.7" })), "203.0.113.7");

  const png = new Uint8Array([137, 80, 78, 71]).buffer;
  const deps = (allow: boolean, ok = true) => ({
    limiter: { allow: () => allow },
    fetchTile: async () => ok ? { ok: true as const, body: png, contentType: "image/png" } : { ok: false as const, reason: "refused" as const },
  });
  const served = await handleMapTileGet(own({ "sec-fetch-site": "same-origin" }), dali, deps(true));
  assert.equal(served.status, 200);
  assert.equal(served.headers.get("cache-control"), "private, max-age=86400");
  assert.equal((await handleMapTileGet(own({ "sec-fetch-site": "cross-site" }), dali, deps(true))).status, 403);
  assert.equal((await handleMapTileGet(own({ "sec-fetch-site": "same-origin" }), { ...dali, layer: "img" }, deps(true))).status, 404);
  assert.equal((await handleMapTileGet(own({ "sec-fetch-site": "same-origin" }), dali, deps(false))).status, 429);
  const failed = await handleMapTileGet(own({ "sec-fetch-site": "same-origin" }), dali, deps(true, false));
  assert.equal(failed.status, 502);
  assert.doesNotMatch(await failed.text(), /tianditu|tk=/iu);
});
