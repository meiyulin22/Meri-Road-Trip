import assert from "node:assert/strict";
import test from "node:test";

import { coverPhoto, requestDestinationPhotos } from "./destination-photos-model";

const image = { url: "https://store.is.autonavi.com/showpic/yl", caption: "玉龙雪山" };

test("photos are read from the server and malformed entries are dropped", async () => {
  const photos = await requestDestinationPhotos("trip a", async (input) => {
    assert.equal(String(input), "/api/trips/trip%20a/destination-photos");
    return Response.json({ photos: [{ key: "云南省/丽江市", label: "丽江市", image },
      { key: "x", label: "x", image: { url: "http://bad", caption: "x" } }, null] });
  });
  assert.deepEqual(photos, [{ key: "云南省/丽江市", label: "丽江市", image }]);
  await assert.rejects(requestDestinationPhotos("t", async () => new Response("", { status: 500 })));
});

test("the cover is the first place's photo, or none", () => {
  assert.equal(coverPhoto(null), null);
  assert.equal(coverPhoto([]), null);
  assert.deepEqual(coverPhoto([{ key: "a", label: "丽江市", image }]), { key: "a", label: "丽江市", image });
});
