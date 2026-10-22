import assert from "node:assert/strict";
import test from "node:test";

import { AmapPlacePhotoProvider } from "@/platform/place-photos/amap-place-photo-provider";
import { NoPlacePhotoProvider } from "@/platform/place-photos/no-place-photo-provider";

import { createPlacePhotoProvider, mapProviderName } from "./map-providers";

test("Amap is the default, Tianditu is chosen by name, and anything else is a configuration error", () => {
  assert.equal(mapProviderName({}), "amap");
  assert.equal(mapProviderName({ MAP_PROVIDER: " " }), "amap");
  assert.equal(mapProviderName({ MAP_PROVIDER: "tianditu" }), "tianditu");
  assert.throws(() => mapProviderName({ MAP_PROVIDER: "google" }), /MAP_PROVIDER must be "amap" or "tianditu"/u);
});

test("Tianditu mode has no photo source yet; Amap mode still has Amap's", () => {
  const original = process.env.MAP_PROVIDER;
  try {
    process.env.MAP_PROVIDER = "tianditu";
    assert.ok(createPlacePhotoProvider() instanceof NoPlacePhotoProvider);
    process.env.MAP_PROVIDER = "amap";
    assert.ok(createPlacePhotoProvider() instanceof AmapPlacePhotoProvider);
  } finally {
    if (original === undefined) delete process.env.MAP_PROVIDER;
    else process.env.MAP_PROVIDER = original;
  }
});
