import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { MediaPhotoStore, mediaPhotoStoreFromEnvironment, searchCacheTtlMs, type StoredPhotoRecord } from "./media-photo-store";
import { fakeJpeg, hit } from "./pixabay-test-fixtures";

async function withDirectory(run: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "meri-media-"));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function record(id: number, bytes: number): StoredPhotoRecord {
  return { source: "pixabay", id, file: `pixabay-${id}.jpg`, format: "jpg", width: 960, height: 640, bytes,
    artist: "uploader", pageUrl: `https://pixabay.com/photos/x-${id}/`, tags: "jade dragon", query: "Jade Dragon",
    matched: ["jade", "dragon"], province: "云南省", region: "丽江市", landmark: "玉龙雪山", reviewed: false,
    fetchedAt: "2026-10-24T00:00:00.000Z" };
}

const key = { region: "丽江市", landmark: "玉龙雪山" };
const image = { url: "/media/place-photos/pixabay-7.jpg", caption: "玉龙雪山", credit: "Photo: uploader / Pixabay" };

test("a published photo and its lookup are read back by a new store on the same directory, as after a restart", async () => {
  await withDirectory(async (directory) => {
    const first = new MediaPhotoStore(directory);
    const body = fakeJpeg(960, 640);
    assert.equal(await first.publish(record(7, body.byteLength), body), "published");
    await first.writeLookup(key, "pixabay-7.jpg", image);

    const restarted = new MediaPhotoStore(directory);
    assert.deepEqual(await restarted.readLookup(key), image);
    assert.deepEqual(await restarted.readLookup({ region: "惠州市", landmark: "玉龙雪山" }), null);
    const served = await restarted.readPublished("pixabay-7.jpg");
    assert.equal(served?.contentType, "image/jpeg");
    assert.equal(served?.body.byteLength, body.byteLength);
    // Nothing is left under a temporary name.
    assert.deepEqual((await readdir(join(directory, "place-photos", "files"))).filter((name) => name.endsWith(".tmp")), []);
  });
});

test("a file without its record is not served or reused, and only Meri's own names are", async () => {
  await withDirectory(async (directory) => {
    const store = new MediaPhotoStore(directory);
    await mkdir(join(directory, "place-photos", "files"), { recursive: true });
    await writeFile(join(directory, "place-photos", "files", "pixabay-8.jpg"), fakeJpeg(960, 640));
    assert.equal(await store.readPublished("pixabay-8.jpg"), null);
    await store.writeLookup({ region: "丽江市", landmark: "泸沽湖" }, "pixabay-8.jpg",
      { url: "/media/place-photos/pixabay-8.jpg", caption: "泸沽湖" });
    assert.equal(await new MediaPhotoStore(directory).readLookup({ region: "丽江市", landmark: "泸沽湖" }), null);
    for (const name of ["../photos.json", "pixabay-8.jpg/..", "pixabay-0.jpg", "x.jpg", "pixabay-8.svg", "pixabay-8.json"]) {
      assert.equal(await store.readPublished(name), null, name);
    }
  });
});

test("past the size cap a new photo is refused, and the ones already stored stay", async () => {
  await withDirectory(async (directory) => {
    const body = fakeJpeg(960, 640, 20_000);
    const store = new MediaPhotoStore(directory, 45_000);
    assert.equal(await store.publish(record(1, body.byteLength), body), "published");
    assert.equal(await store.publish(record(2, body.byteLength), body), "published");
    assert.equal(await store.publish(record(3, body.byteLength), body), "full");
    assert.ok(await store.readPublished("pixabay-1.jpg"));
    assert.equal(await store.readPublished("pixabay-3.jpg"), null);
    // A new process counts what is already on disk.
    assert.equal(await new MediaPhotoStore(directory, 45_000).publish(record(4, body.byteLength), body), "full");
  });
});

test("a search answer, empty or not, is kept for 24 hours and then asked again", async () => {
  await withDirectory(async (directory) => {
    const store = new MediaPhotoStore(directory);
    const now = Date.parse("2026-10-24T00:00:00Z");
    await store.writeSearch("q=Lugu+Lake", [], now);
    await store.writeSearch("q=Jade+Dragon", [hit(5, "jade dragon")], now);
    assert.deepEqual(await new MediaPhotoStore(directory).readSearch("q=Lugu+Lake", now + 1000), []);
    assert.equal((await store.readSearch("q=Jade+Dragon", now + 1000))?.[0].id, 5);
    assert.equal(await store.readSearch("q=Lugu+Lake", now + searchCacheTtlMs), null);
    assert.equal(await store.readSearch("q=Never+Asked", now), null);
  });
});

test("a production server needs MERI_MEDIA_DIR; development falls back to .cache/media", () => {
  assert.equal(mediaPhotoStoreFromEnvironment({ NODE_ENV: "production" }), null);
  assert.ok(mediaPhotoStoreFromEnvironment({ NODE_ENV: "production", MERI_MEDIA_DIR: "/var/lib/meri/media" }));
  assert.ok(mediaPhotoStoreFromEnvironment({ NODE_ENV: "development" }));
});
