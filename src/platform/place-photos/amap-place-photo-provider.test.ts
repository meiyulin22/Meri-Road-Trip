import assert from "node:assert/strict";
import test from "node:test";

import { AmapPlacePhotoProvider, PlacePhotoMemory } from "./amap-place-photo-provider";

function provider(body: unknown, seen: { url?: URL; init?: RequestInit; calls?: number } = {}, ok = true,
  memory = new PlacePhotoMemory()) {
  return new AmapPlacePhotoProvider(async (input, init) => {
    seen.url = new URL(String(input));
    seen.init = init;
    seen.calls = (seen.calls ?? 0) + 1;
    return ok ? Response.json(body) : new Response("no", { status: 500 });
  }, memory);
}

test("a named place is searched inside its region and its http photo upgraded to https", async () => {
  process.env.AMAP_API_KEY = "test-secret-key";
  const seen: { url?: URL; init?: RequestInit } = {};
  const photo = await provider({ status: "1", pois: [
    { name: "玉龙雪山国家级风景名胜区", photos: [{ url: "http://store.is.autonavi.com/showpic/abc" }] },
  ] }, seen).findPhoto({ kind: "named", keywords: "玉龙雪山", region: "丽江市" });
  assert.deepEqual(photo, { url: "https://store.is.autonavi.com/showpic/abc", caption: "玉龙雪山国家级风景名胜区" });
  assert.equal(seen.url?.searchParams.get("keywords"), "玉龙雪山");
  assert.equal(seen.url?.searchParams.get("region"), "丽江市");
  assert.equal(seen.url?.searchParams.get("city_limit"), "true");
  assert.equal(seen.url?.searchParams.get("show_fields"), "photos");
  assert.equal(seen.init?.cache, "no-store");
});

test("a scenic lookup asks for national scenic areas instead of a keyword", async () => {
  process.env.AMAP_API_KEY = "test-secret-key";
  const seen: { url?: URL } = {};
  await provider({ status: "1", pois: [] }, seen).findPhoto({ kind: "scenic", region: "云南省" });
  assert.equal(seen.url?.searchParams.get("types"), "110202");
  assert.equal(seen.url?.searchParams.has("keywords"), false);
});

test("photos from unknown hosts are skipped for the next usable one", async () => {
  process.env.AMAP_API_KEY = "test-secret-key";
  const photo = await provider({ status: "1", pois: [
    { name: "无图", photos: [] },
    { name: "外站", photos: [{ url: "https://evil.example/x.jpg" }, { url: "not a url" }] },
    { name: "西湖", photos: [{ url: "https://aos-comment.amap.com/B0/comment/x.jpg" }] },
  ] }).findPhoto({ kind: "named", keywords: "西湖", region: "杭州市" });
  assert.deepEqual(photo, { url: "https://aos-comment.amap.com/B0/comment/x.jpg", caption: "西湖" });
});

test("no key, an HTTP failure, a bad body or a thrown fetch all mean no photo", async () => {
  const query = { kind: "named", keywords: "大理", region: null } as const;
  delete process.env.AMAP_API_KEY;
  assert.equal(await provider({ status: "1", pois: [] }).findPhoto(query), null);
  process.env.AMAP_API_KEY = "test-secret-key";
  assert.equal(await provider({}, {}, false).findPhoto(query), null);
  assert.equal(await provider({ status: "0" }).findPhoto(query), null);
  assert.equal(await new AmapPlacePhotoProvider(async () => { throw new Error("secret-key in url"); }).findPhoto(query), null);
});

test("real answers are remembered for a week, refusals and outages are not", async () => {
  process.env.AMAP_API_KEY = "test-secret-key";
  const query = { kind: "scenic", region: "丹东市" } as const;
  let now = 0;
  const memory = new PlacePhotoMemory(() => now);
  const seen: { calls?: number } = {};
  const found = provider({ status: "1", pois: [{ name: "鸭绿江断桥", photos: [{ url: "https://store.is.autonavi.com/showpic/x" }] }] }, seen, true, memory);
  await found.findPhoto(query);
  await found.findPhoto(query);
  assert.equal(seen.calls, 1);
  now = 7 * 24 * 60 * 60 * 1000 + 1;
  await found.findPhoto(query);
  assert.equal(seen.calls, 2);

  const refusedMemory = new PlacePhotoMemory();
  const refused: { calls?: number } = {};
  const limited = provider({ status: "0", info: "INVALID_PARAMS", infocode: "20000" }, refused, true, refusedMemory);
  assert.equal(await limited.findPhoto(query), null);
  assert.equal(await limited.findPhoto(query), null);
  assert.equal(refused.calls, 2);
});
