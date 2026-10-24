import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { handleMediaPhotoGet } from "@/app/media/place-photos/[file]/route";

import { MediaPhotoStore } from "./media-photo-store";
import { fakeJpeg } from "./pixabay-test-fixtures";

test("a photo downloaded after the server started is served at once, and only by Meri's own names", async () => {
  const directory = await mkdtemp(join(tmpdir(), "meri-route-"));
  try {
    const store = new MediaPhotoStore(directory);
    assert.equal((await handleMediaPhotoGet("pixabay-5.jpg", store)).status, 404);
    const body = fakeJpeg(960, 640);
    await store.publish({ source: "pixabay", id: 5, file: "pixabay-5.jpg", format: "jpg", width: 960, height: 640,
      bytes: body.byteLength, artist: "a", pageUrl: "https://pixabay.com/photos/x-5/", tags: "", query: "", matched: [],
      province: "云南省", region: "丽江市", landmark: "玉龙雪山", reviewed: false, fetchedAt: "2026-10-24T00:00:00.000Z" }, body);
    const served = await handleMediaPhotoGet("pixabay-5.jpg", store);
    assert.equal(served.status, 200);
    assert.equal(served.headers.get("Content-Type"), "image/jpeg");
    assert.equal(served.headers.get("X-Content-Type-Options"), "nosniff");
    assert.match(served.headers.get("Cache-Control") ?? "", /immutable/u);
    assert.equal((await served.arrayBuffer()).byteLength, body.byteLength);
    for (const name of ["..%2Fphotos.json", "../place-photos/files/pixabay-5.json", "pixabay-5.json"]) {
      assert.equal((await handleMediaPhotoGet(name, store)).status, 404, name);
    }
    assert.equal((await handleMediaPhotoGet("pixabay-5.jpg", null)).status, 404);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
