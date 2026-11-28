import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import manifest from "./catalog-entry-photos.json";
import { catalogEntryPhoto, parseCatalogEntryPhotos } from "./catalog-entry-photos";

const entry = {
  file: "/photos/catalog/spot_example_lake.avif",
  width: 320,
  height: 240,
  title: "File:Example.jpg",
  author: "Example photographer",
  license: "CC BY-SA 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
  sourceUrl: "https://commons.wikimedia.org/wiki/File:Example.jpg",
  wikidata: "Q1",
  fetchedAt: "2026-11-27T00:00:00.000Z",
};

test("a manifest entry becomes a photo with its credit", () => {
  const photos = parseCatalogEntryPhotos({ spot_example_lake: entry });
  assert.deepEqual(photos.get("spot_example_lake"), {
    url: entry.file, width: 320, height: 240, author: entry.author, license: entry.license,
    licenseUrl: entry.licenseUrl, sourceUrl: entry.sourceUrl,
  });
});

test("an entry without its credit, off Commons, or pointing at another file is refused", () => {
  assert.throws(() => parseCatalogEntryPhotos({ spot_example_lake: { ...entry, author: "" } }));
  assert.throws(() => parseCatalogEntryPhotos({ spot_example_lake: { ...entry, licenseUrl: "http://example.com" } }));
  assert.throws(() => parseCatalogEntryPhotos({ spot_example_lake: { ...entry, sourceUrl: "https://example.com/a.jpg" } }));
  assert.throws(() => parseCatalogEntryPhotos({ spot_other: entry }), /not its own file/u);
  assert.throws(() => parseCatalogEntryPhotos({ "../x": entry }));
});

test("the saved manifest passes, and every photo it names is in public/", () => {
  const photos = parseCatalogEntryPhotos(manifest);
  assert.ok(photos.size > 300);
  for (const photo of photos.values()) {
    assert.ok(existsSync(join(process.cwd(), "public", photo.url)), photo.url);
  }
  assert.equal(catalogEntryPhoto("spot_dali_cangshan")?.url, "/photos/catalog/spot_dali_cangshan.avif");
  assert.equal(catalogEntryPhoto("spot_not_in_catalog"), null);
});
