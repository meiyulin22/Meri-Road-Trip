import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";

import { AmapPlacePhotoProvider } from "@/platform/place-photos/amap-place-photo-provider";
import { CatalogPhotoProvider } from "@/platform/place-photos/catalog-photo-provider";

import { createPlacePhotoProvider, mapProviderName } from "./map-providers";

test("Amap is the default, Tianditu is chosen by name, and anything else is a configuration error", () => {
  assert.equal(mapProviderName({}), "amap");
  assert.equal(mapProviderName({ MAP_PROVIDER: " " }), "amap");
  assert.equal(mapProviderName({ MAP_PROVIDER: "tianditu" }), "tianditu");
  assert.throws(() => mapProviderName({ MAP_PROVIDER: "google" }), /MAP_PROVIDER must be "amap" or "tianditu"/u);
});

test("Tianditu mode reads photos from the local catalog; Amap mode still has Amap's", () => {
  const original = process.env.MAP_PROVIDER;
  try {
    process.env.MAP_PROVIDER = "tianditu";
    assert.ok(createPlacePhotoProvider() instanceof CatalogPhotoProvider);
    process.env.MAP_PROVIDER = "amap";
    assert.ok(createPlacePhotoProvider() instanceof AmapPlacePhotoProvider);
  } finally {
    if (original === undefined) delete process.env.MAP_PROVIDER;
    else process.env.MAP_PROVIDER = original;
  }
});

test("in Tianditu mode, the photos every page, cover and chat reply use never reach the network", async () => {
  const original = { provider: process.env.MAP_PROVIDER, fetch: globalThis.fetch };
  let fetched = 0;
  try {
    process.env.MAP_PROVIDER = "tianditu";
    globalThis.fetch = (async () => { fetched += 1; throw new Error("no network here"); }) as typeof fetch;
    const photos = createPlacePhotoProvider();
    assert.equal(await photos.findPhoto({ kind: "named", keywords: "一个图集里没有的景点", region: "丽江市" }), null);
    // A region no catalog will ever hold, so the answer is a miss whatever the catalog grows to.
    assert.equal(await photos.findPhoto({ kind: "scenic", region: "测试用不存在市" }), null);
    assert.equal(fetched, 0);
  } finally {
    globalThis.fetch = original.fetch;
    if (original.provider === undefined) delete process.env.MAP_PROVIDER;
    else process.env.MAP_PROVIDER = original.provider;
  }
});

test("only the recommendation-photo route may search Wikimedia or Pixabay", () => {
  const root = join(process.cwd(), "src");
  const callers: string[] = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (/\.tsx?$/u.test(entry.name) && !/\.test\.tsx?$/u.test(entry.name) &&
        readFileSync(path, "utf8").includes("createRemotePhotoFinders(")) {
        // relative() yields backslashes on Windows, so compare in one separator.
        callers.push(relative(root, path).split("\\").join("/"));
      }
    }
  };
  visit(root);
  assert.deepEqual(callers.sort(), ["app/api/trips/[id]/destination-recommendation-photos/route.ts", "platform/map-providers.ts"]);
});
