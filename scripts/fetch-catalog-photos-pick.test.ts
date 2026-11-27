import assert from "node:assert/strict";
import test from "node:test";

import type { CommonsFile } from "@/platform/place-photos/wikimedia-client";
import { manifestEntry, photoCandidates, photoFilename, photoQuery, photoWidth, pickCandidate,
  type CatalogPhotoSubject } from "./fetch-catalog-photos-pick";

const spot: CatalogPhotoSubject = { id: "spot_example_lake", kind: "spot", name: "示例湖", aliases: ["Example Lake"],
  province: "云南省", prefecture: "大理白族自治州", county: null, summary: "示例。" };
const dish: CatalogPhotoSubject = { ...spot, id: "dish_example", kind: "dish", name: "示例菜", aliases: ["另一道菜"] };

function row(item: number, file: string, name: string, rank = "1") {
  return { item: `http://www.wikidata.org/entity/Q${item}`,
    image: `http://commons.wikimedia.org/wiki/Special:FilePath/${file}`, name, rank };
}

const commons: CommonsFile = { pageId: 1, title: "File:Example.jpg",
  pageUrl: "https://commons.wikimedia.org/wiki/File:Example.jpg", width: 640, height: 480, mime: "image/jpeg",
  thumbUrl: "https://upload.wikimedia.org/example.jpg", artist: "Example photographer", license: "CC BY-SA 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/", nonFree: false };

test("spot queries reuse landmark names and aliases with the prefecture and province guard", () => {
  const query = photoQuery(spot) ?? "";
  assert.match(query, /"示例湖"@zh/u);
  assert.match(query, /"Example Lake"@en/u);
  assert.match(query, /"大理白族自治州"@zh/u);
  assert.match(query, /"云南省"@zh/u);
  assert.match(query, /\?item wdt:P131\+ \?region/u);
  assert.equal(photoWidth("spot"), 320);
});

test("dish queries match the exact Chinese name as a label or alias and exclude foreign country and origin", () => {
  const query = photoQuery(dish) ?? "";
  assert.match(query, /"示例菜"@zh/u);
  assert.match(query, /"示例菜"@zh-hant/u);
  assert.doesNotMatch(query, /另一道菜/u);
  assert.match(query, /skos:altLabel \?name/u);
  assert.match(query, /wd:Q2095 wd:Q746549/u);
  assert.match(query, /wdt:P31\/wdt:P279\*/u);
  assert.match(query, /FILTER NOT EXISTS \{\s+\?item \(wdt:P17\|wdt:P495\) \?country\.\s+FILTER \(\?country != wd:Q148\)/u);
  assert.equal(photoWidth("dish"), 200);
});

test("candidates use Wikidata ranking and ignore malformed file links and inexact dish labels", () => {
  const rows = [row(3, "Alias.jpg", spot.name, "2"), row(2, "Exact%20name.jpg", spot.name),
    row(1, "Bad%ZZ.jpg", spot.name), row(4, "Dish.jpg", dish.name, "2")];
  assert.deepEqual(photoCandidates(rows.slice(0, 3), spot).map(({ file }) => file), ["Exact name.jpg", "Alias.jpg"]);
  assert.deepEqual(photoCandidates(rows, dish).map(({ file }) => file), ["Dish.jpg"]);
});

test("pass over a forbidden licence, missing required author, and undersized image in order", () => {
  const candidates = photoCandidates([row(1, "Forbidden.jpg", spot.name), row(2, "No_author.jpg", spot.name),
    row(3, "Small.jpg", spot.name), row(4, "Good.jpg", spot.name), row(5, "Other.jpg", spot.name)], spot);
  const files = new Map([
    ["Forbidden.jpg", { ...commons, license: "CC BY-NC 4.0" }],
    ["No_author.jpg", { ...commons, artist: "" }],
    ["Small.jpg", { ...commons, width: 319 }],
    ["Good.jpg", commons],
    ["Other.jpg", commons],
  ]);
  assert.deepEqual(pickCandidate(candidates, files, 320), { candidate: { image: candidates[3], file: commons } });
  assert.deepEqual(pickCandidate([], files, 320), { rejection: { reason: "no_wikidata" } });
  assert.deepEqual(pickCandidate(candidates.slice(0, 3), files, 320), { rejection: { reason: "licence", detail: "licence" } });
  assert.deepEqual(pickCandidate(candidates.slice(1, 2), files, 320), { rejection: { reason: "no_author" } });
  assert.deepEqual(pickCandidate(candidates.slice(2, 3), files, 320), { rejection: { reason: "too_small" } });
  assert.deepEqual(pickCandidate(candidates.slice(3, 4), new Map(), 320),
    { rejection: { reason: "review", detail: "missing_commons_file" } });
});

test("manifest entries preserve Commons credit and safe IDs, including public-domain files", () => {
  const [image] = photoCandidates([row(1, "Example.jpg", dish.name)], dish);
  const file = { ...commons, artist: "", license: "Public domain", licenseUrl: "" };
  assert.deepEqual(pickCandidate([image], new Map([[image.file, file]]), 200), { candidate: { image, file } });
  const fetchedAt = new Date("2026-11-27T00:00:00.000Z");
  assert.deepEqual(manifestEntry(dish.id, { image, file }, { width: 200, height: 150 }, fetchedAt), {
    file: "/photos/catalog/dish_example.avif", width: 200, height: 150, title: commons.title, author: "Unknown author",
    license: "Public domain", licenseUrl: commons.pageUrl, sourceUrl: commons.pageUrl, wikidata: "Q1",
    fetchedAt: fetchedAt.toISOString(),
  });
  assert.throws(() => photoFilename("../outside"), /Invalid catalog photo ID/u);
});
