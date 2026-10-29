import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";

import { CatalogPhotoProvider } from "@/platform/place-photos/catalog-photo-provider";
import { TiandituLocationProvider } from "@/platform/tianditu/tianditu-location-provider";

import { createLocationProvider, createPlacePhotoProvider, mapProviderName } from "./map-providers";

test("Tianditu verifies places and the local catalog supplies photos, with no switch left to Amap", () => {
  assert.equal(mapProviderName, "tianditu");
  assert.ok(createLocationProvider() instanceof TiandituLocationProvider);
  assert.ok(createPlacePhotoProvider() instanceof CatalogPhotoProvider);
});

test("the photos every page, cover and chat reply use never reach the network", async () => {
  const original = { fetch: globalThis.fetch };
  let fetched = 0;
  try {
    globalThis.fetch = (async () => { fetched += 1; throw new Error("no network here"); }) as typeof fetch;
    const photos = createPlacePhotoProvider();
    assert.equal(await photos.findPhoto({ kind: "named", keywords: "一个图集里没有的景点", region: "丽江市" }), null);
    // A region no catalog will ever hold, so the answer is a miss whatever the catalog grows to.
    assert.equal(await photos.findPhoto({ kind: "scenic", region: "测试用不存在市" }), null);
    assert.equal(fetched, 0);
  } finally {
    globalThis.fetch = original.fetch;
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
