import assert from "node:assert/strict";
import { mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { handlePhotoCreditGet } from "@/app/photo-credits/source/[file]/route";

import { MediaPhotoStore, type PixabayPhotoRecord, type WikimediaPhotoRecord } from "./media-photo-store";
import { loadPhotoCatalog } from "./catalog-photo-provider";
import type { CatalogEntry } from "./photo-catalog";
import { fakeJpeg } from "./pixabay-test-fixtures";

const profile = "https://pixabay.com/users/wangsuishi-5722660/";
const original = "https://pixabay.com/photos/sanya-yalong-bay-sea-view-room-2437983/";
const entry: CatalogEntry = { file: "sanya-2437983.jpg", artist: "wangsuishi", artistUrl: profile,
  pageUrl: original, fetchedAt: "2026-10-25", aliases: [], regions: ["三亚市"], scenicFor: ["三亚市"] };

test("a bundled Pixabay credit opens the photographer, with the original page as a legacy fallback", async () => {
  const credited = await handlePhotoCreditGet(entry.file, { 亚龙湾: entry }, null);
  assert.equal(credited.status, 307);
  assert.equal(credited.headers.get("Location"), profile);
  assert.equal(credited.headers.get("Cache-Control"), "no-store");
  assert.equal((await handlePhotoCreditGet(entry.file, { 亚龙湾: { ...entry, artistUrl: undefined } }, null))
    .headers.get("Location"), original);
});

test("an existing runtime card resolves source metadata without changing the saved image", async () => {
  const directory = await mkdtemp(join(tmpdir(), "meri-credit-"));
  try {
    const store = new MediaPhotoStore(directory);
    const body = fakeJpeg(640, 480);
    const record: PixabayPhotoRecord = { source: "pixabay", id: 2437983, file: "pixabay-2437983.jpg", format: "jpg",
      width: 640, height: 480, bytes: body.byteLength, artist: "wangsuishi", pageUrl: original, artistUrl: profile,
      tags: "", query: "", matched: [], province: "海南省", region: "三亚市", landmark: "亚龙湾",
      reviewed: false, fetchedAt: "2026-10-25T00:00:00.000Z" };
    assert.equal((await handlePhotoCreditGet(record.file, {}, store)).status, 404);
    await store.publish(record, body);
    assert.equal((await handlePhotoCreditGet(record.file, {}, store)).headers.get("Location"), profile);
    const metadata = join(directory, "place-photos", "files", "pixabay-2437983.json");
    await writeFile(metadata, JSON.stringify({ ...record, artistUrl: undefined }));
    assert.equal((await handlePhotoCreditGet(record.file, {}, store)).headers.get("Location"), original);
    await writeFile(metadata, JSON.stringify({ ...record, artistUrl: "https://evil.test/users/author-1/",
      pageUrl: "https://pixabay.com.evil.test/photos/2437983/" }));
    assert.equal((await handlePhotoCreditGet(record.file, {}, store)).status, 404);
    await unlink(join(directory, "place-photos", "files", record.file));
    assert.equal((await handlePhotoCreditGet(record.file, {}, store)).status, 404);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("the reported Simao Commons credit resolves to its exact external file page for confirmation", async () => {
  const file = "simao-confucian-temple-154844611.jpg";
  const catalog = loadPhotoCatalog();
  const simaoEntry = Object.values(catalog).find((photo) => photo.file === file)!;
  const details = await handlePhotoCreditGet(file, catalog, null, true);
  assert.equal(details.status, 200);
  assert.equal(details.headers.get("Location"), null);
  assert.equal(details.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await details.json(), { url: simaoEntry.pageUrl, artist: "瑞丽江的河水", source: "wikimedia" });
  const redirect = await handlePhotoCreditGet(file, catalog, null);
  assert.equal(redirect.status, 307);
  assert.equal(redirect.headers.get("Location"), simaoEntry.pageUrl);
  const pixabay = await handlePhotoCreditGet("sanya-2437983.jpg", { 亚龙湾: entry }, null, true);
  assert.deepEqual(await pixabay.json(), { url: profile, artist: "wangsuishi", source: "pixabay" });
});

test("a runtime Commons photo resolves from a complete source record, with unsafe file pages refused", async () => {
  const directory = await mkdtemp(join(tmpdir(), "meri-commons-credit-"));
  try {
    const store = new MediaPhotoStore(directory);
    const body = fakeJpeg(500, 333);
    const record: WikimediaPhotoRecord = { source: "wikimedia", id: 321, file: "wikimedia-321.jpg", format: "jpg",
      width: 500, height: 333, bytes: body.byteLength, artist: "Photographer", pageUrl: "https://commons.wikimedia.org/wiki/File:Shimei_Bay_in_Wanning.jpg",
      title: "File:Shimei_Bay_in_Wanning.jpg", item: "Q321", matched: "石梅湾", license: "CC BY-SA 3.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/", originalWidth: 1500, originalHeight: 1000,
      province: "海南省", region: "万宁市", landmark: "石梅湾", reviewed: false, fetchedAt: "2026-10-25T00:00:00.000Z" };
    assert.equal((await handlePhotoCreditGet(record.file, {}, store)).status, 404);
    await store.publish(record, body);
    assert.equal((await handlePhotoCreditGet(record.file, {}, store)).headers.get("Location"), record.pageUrl);
    const metadata = join(directory, "place-photos", "files", "wikimedia-321.json");
    for (const pageUrl of ["https://commons.wikimedia.org.evil.test/wiki/File:Test.jpg", "http://commons.wikimedia.org/wiki/File:Test.jpg",
      "https://commons.wikimedia.org/wiki/Special:Redirect/file/Test.jpg", "https://commons.wikimedia.org/wiki/File:",
      "https://commons.wikimedia.org/wiki/File:Test.jpg?target=https://evil.test/", "https://evil.test/wiki/File:Test.jpg"]) {
      await writeFile(metadata, JSON.stringify({ ...record, pageUrl }));
      assert.equal((await handlePhotoCreditGet(record.file, {}, store, true)).status, 404, pageUrl);
    }
    await writeFile(metadata, JSON.stringify({ ...record, source: "pixabay" }));
    assert.equal((await handlePhotoCreditGet(record.file, {}, store)).status, 404);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("credits reject unknown files, traversal, mismatched sources and unsafe external links", async () => {
  for (const file of ["missing.jpg", "../sanya-2437983.jpg", "..%2Fsanya-2437983.jpg", "photos.json"]) {
    assert.equal((await handlePhotoCreditGet(file, { 亚龙湾: entry }, null)).status, 404);
  }
  assert.equal((await handlePhotoCreditGet(entry.file, { 亚龙湾: { ...entry, source: "wikimedia" } }, null)).status, 404);
  for (const pageUrl of ["javascript:alert(1)", "http://pixabay.com/photos/test-1/", "https://pixabay.com@evil.test/photos/test-1/",
    "https://pixabay.com:8443/photos/test-1/", "https://pixabay.com/photos/test-1/?redirect=https://evil.test/",
    "https://pixabay.com/photos/test-1/#x"]) {
    const unsafe = { ...entry, artistUrl: undefined, pageUrl };
    assert.equal((await handlePhotoCreditGet(entry.file, { 亚龙湾: unsafe }, null)).status, 404, pageUrl);
  }
});
