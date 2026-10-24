import assert from "node:assert/strict";
import test from "node:test";

import { readImageFacts } from "./image-file";
import { fakeJpeg } from "./pixabay-test-fixtures";

function png(width: number, height: number): Uint8Array {
  const body = new Uint8Array(33);
  body.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(body.buffer).setUint32(16, width);
  new DataView(body.buffer).setUint32(20, height);
  return body;
}

function webpVp8x(width: number, height: number): Uint8Array {
  const body = new Uint8Array(30);
  body.set([...new TextEncoder().encode("RIFF"), 0, 0, 0, 0, ...new TextEncoder().encode("WEBPVP8X")]);
  const w = width - 1;
  const h = height - 1;
  body.set([w & 0xff, (w >> 8) & 0xff, (w >> 16) & 0xff, h & 0xff, (h >> 8) & 0xff, (h >> 16) & 0xff], 24);
  return body;
}

test("a JPEG, PNG or WebP is read for its real format and size", () => {
  assert.deepEqual(readImageFacts(fakeJpeg(960, 640)), { format: "jpg", width: 960, height: 640 });
  assert.deepEqual(readImageFacts(png(1200, 800)), { format: "png", width: 1200, height: 800 });
  assert.deepEqual(readImageFacts(webpVp8x(1024, 683)), { format: "webp", width: 1024, height: 683 });
});

test("anything else — HTML, an empty file, a truncated header — is not an image", () => {
  assert.equal(readImageFacts(new TextEncoder().encode("<!DOCTYPE html><html>")), null);
  assert.equal(readImageFacts(new Uint8Array()), null);
  assert.equal(readImageFacts(fakeJpeg(960, 640).subarray(0, 12)), null);
  assert.equal(readImageFacts(png(0, 800)), null);
});
