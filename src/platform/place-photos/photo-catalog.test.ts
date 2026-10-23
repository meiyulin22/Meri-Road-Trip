import assert from "node:assert/strict";
import test from "node:test";

import { parsePlaceImage } from "@/domain/location/place-image";

import { normalizePlaceName, photoFromCatalog, type PhotoCatalog } from "./photo-catalog";

const catalog: PhotoCatalog = {
  布达拉宫: { file: "potala-palace.jpg", artist: "InkMagiStudio",
    pageUrl: "https://pixabay.com/photos/potala-palace-4742065/", fetchedAt: "2026-10-23" },
};

test("a catalogued place gets our own copy, with the photographer credited", () => {
  const image = photoFromCatalog(catalog, "布达拉宫");
  assert.deepEqual(image, { url: "/photos/potala-palace.jpg", caption: "布达拉宫",
    credit: "Photo: InkMagiStudio / Pixabay" });
  // The domain accepts a root-relative URL: our own file on our own origin.
  assert.equal(parsePlaceImage(image)?.url, "/photos/potala-palace.jpg");
});

test("a place that is not catalogued has no photo, which is not an error", () => {
  assert.equal(photoFromCatalog(catalog, "贡嘎山"), null);
});

test("names are compared without spaces or a parenthesised suffix", () => {
  assert.equal(normalizePlaceName(" 布达拉宫 "), "布达拉宫");
  assert.equal(normalizePlaceName("玉龙雪山（丽江）"), "玉龙雪山");
  // 布达拉宫（拉萨） is the same place with the parenthetical dropped.
  assert.equal(photoFromCatalog(catalog, " 布达拉宫（拉萨） ")?.url, "/photos/potala-palace.jpg");
});

test("our own photo path is accepted, while http and escaping paths are not", () => {
  assert.equal(parsePlaceImage({ url: "/photos/x.jpg", caption: "x" })?.url, "/photos/x.jpg");
  assert.equal(parsePlaceImage({ url: "http://example.com/x.jpg", caption: "x" }), null);
  assert.equal(parsePlaceImage({ url: "/photos/../etc/passwd", caption: "x" }), null);
  assert.equal(parsePlaceImage({ url: "https://cdn.example.com/x.jpg", caption: "x" })?.url,
    "https://cdn.example.com/x.jpg");
});

test("the provider answers null for a place the catalog does not hold", async () => {
  const { CatalogPhotoProvider } = await import("./catalog-photo-provider");
  const provider = new CatalogPhotoProvider();
  assert.equal(await provider.findPhoto({ kind: "named", keywords: "不存在的景点", region: null }), null);
});
