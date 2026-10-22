import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import type { TiandituClient } from "@/platform/tianditu/tianditu-fetch";
import type { FamousSight, FamousSightFinder } from "@/platform/wikidata/wikidata-sights";

import { PlacePhotoMemory } from "./amap-place-photo-provider";
import { commonsThumbnailUrl, WikimediaPlacePhotoProvider } from "./wikimedia-place-photo-provider";

const yulong: FamousSight = {
  id: "Q1465660", label: "玉龙雪山", englishLabel: "Jade Dragon Snow Mountain", longitude: 100.2, latitude: 27.1,
  image: "Yulong Xueshan 08.JPG", editions: 27,
};

function sights(byName: Record<string, FamousSight>): FamousSightFinder {
  return { findFamousSight: async (name) => (byName[name] ? { status: "found", sight: byName[name] } : { status: "none" }) };
}

const noTianditu: TiandituClient = { get: async () => ({ ok: false, reason: "refused" }) };

/** As Commons answered on 2026-10-22: the thumbnail on thumb.wikimedia.org, tagged with utm_ parameters. */
const thumb = "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Yulong_Xueshan_08.JPG/960px-Yulong_Xueshan_08.JPG";
const commons: typeof fetch = async () => Response.json({ query: { pages: { "1": { imageinfo: [{
  thumburl: `${thumb}?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail`,
  url: "https://upload.wikimedia.org/wikipedia/commons/a/ab/Yulong_Xueshan_08.JPG", extmetadata: {
  LicenseShortName: { value: "Public domain" },
  Artist: { value: "<a href=\"//commons.wikimedia.org/wiki/User:Br\">Brücke-Osteuropa</a>" },
} }] } } } });

test("a Commons thumbnail is linked at the path built from its file name's MD5", () => {
  const hash = createHash("md5").update("Yulong_Xueshan_08.JPG").digest("hex");
  assert.equal(commonsThumbnailUrl("Yulong Xueshan 08.JPG"),
    `https://upload.wikimedia.org/wikipedia/commons/thumb/${hash[0]}/${hash.slice(0, 2)}/Yulong_Xueshan_08.JPG/960px-Yulong_Xueshan_08.JPG`);
});

test("a named sight's photo carries its author and licence, as the licence asks", async () => {
  const provider = new WikimediaPlacePhotoProvider(sights({ 玉龙雪山: yulong }), noTianditu, commons, new PlacePhotoMemory());
  assert.deepEqual(await provider.findPhoto({ kind: "named", keywords: "玉龙雪山", region: "丽江市" }), {
    url: thumb, caption: "玉龙雪山",
    credit: "Brücke-Osteuropa · Public domain · Wikimedia Commons",
  });
});

test("a name that is not exactly the sight's, a drawing, or a photo with no licence gets no photo", async () => {
  const memory = () => new PlacePhotoMemory();
  const loose = new WikimediaPlacePhotoProvider(sights({ 玉龙: yulong }), noTianditu, commons, memory());
  assert.equal(await loose.findPhoto({ kind: "named", keywords: "玉龙", region: null }), null);
  const drawing = new WikimediaPlacePhotoProvider(sights({ 玉龙雪山: { ...yulong, image: "Map.svg" } }), noTianditu, commons, memory());
  assert.equal(await drawing.findPhoto({ kind: "named", keywords: "玉龙雪山", region: null }), null);
  const unlicensed = new WikimediaPlacePhotoProvider(sights({ 玉龙雪山: yulong }), noTianditu,
    async () => Response.json({ query: { pages: { "1": { imageinfo: [{ extmetadata: {} }] } } } }), memory());
  assert.equal(await unlicensed.findPhoto({ kind: "named", keywords: "玉龙雪山", region: null }), null);
});

test("a region's photo is its best-known scenic place that has one", async () => {
  const lugu: FamousSight = { ...yulong, id: "Q1351120", label: "泸沽湖", image: "Lugu Lake.jpg", editions: 29 };
  const scenic: TiandituClient = { get: async () => ({ ok: true, body: { pois: [
    { name: "玉龙雪山" }, { name: "泸沽湖" }, { name: "丽江古城-大水车" }, { name: "无名景点" },
  ] } }) };
  const provider = new WikimediaPlacePhotoProvider(sights({ 玉龙雪山: yulong, 泸沽湖: lugu }), scenic, commons, new PlacePhotoMemory());
  assert.equal((await provider.findPhoto({ kind: "scenic", region: "丽江市" }))?.caption, "泸沽湖");
});

test("an unavailable Wikidata leaves no remembered 'no photo' behind", async () => {
  let available = false;
  const flaky: FamousSightFinder = { findFamousSight: async () =>
    (available ? { status: "found", sight: yulong } : { status: "unavailable" }) };
  const provider = new WikimediaPlacePhotoProvider(flaky, noTianditu, commons, new PlacePhotoMemory());
  assert.equal(await provider.findPhoto({ kind: "named", keywords: "玉龙雪山", region: null }), null);
  available = true;
  assert.equal((await provider.findPhoto({ kind: "named", keywords: "玉龙雪山", region: null }))?.caption, "玉龙雪山");
});
