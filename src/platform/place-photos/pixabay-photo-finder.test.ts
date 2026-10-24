import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { MediaPhotoStore } from "./media-photo-store";
import { PixabayClient } from "./pixabay-client";
import { PixabayPhotoFinder } from "./pixabay-photo-finder";
import type { RemotePhotoSubject } from "./pixabay-photo-match";
import { hit, scriptedFetch, searchAnswer, type ScriptedFetch } from "./pixabay-test-fixtures";

const yulong: RemotePhotoSubject = { province: "云南省", region: "丽江市", landmark: "玉龙雪山", english: "Jade Dragon Snow Mountain" };

async function withDirectory(run: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "meri-finder-"));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function finder(directory: string, scripted: ScriptedFetch, clock = { now: Date.parse("2026-10-24T00:00:00Z") }) {
  return new PixabayPhotoFinder({ client: new PixabayClient({ key: "k", fetcher: scripted.fetcher }),
    store: new MediaPhotoStore(directory), now: () => clock.now });
}

test("a miss is searched, checked, downloaded and kept; a restarted server answers it with no request", async () => {
  await withDirectory(async (directory) => {
    const scripted = scriptedFetch({ search: () => searchAnswer([hit(42, "jade dragon snow mountain, lijiang")]) });
    const first = finder(directory, scripted);
    const found = await first.find(yulong, first.startBatch());
    assert.deepEqual(found, { status: "found", image: { url: "/media/place-photos/pixabay-42.jpg", caption: "玉龙雪山",
      credit: "Photo: uploader / Pixabay" } });
    assert.equal(scripted.searches(), 1);
    assert.equal(scripted.downloads(), 1);
    assert.match(scripted.asked[1], /g42_640\.jpg$/u);

    const after = scriptedFetch({ search: () => { throw new Error("must not search"); } });
    const restarted = finder(directory, after);
    assert.deepEqual(await restarted.find(yulong, restarted.startBatch()), found);
    assert.deepEqual(after.asked, []);
  });
});

test("the same lookup asked twice at once shares one search and one download", async () => {
  await withDirectory(async (directory) => {
    const scripted = scriptedFetch({ search: () => searchAnswer([hit(42, "jade dragon snow mountain, china")]) });
    const shared = finder(directory, scripted);
    const [left, right] = await Promise.all([shared.find(yulong, shared.startBatch()), shared.find(yulong, shared.startBatch())]);
    assert.deepEqual(left, right);
    assert.equal(scripted.searches(), 1);
    assert.equal(scripted.downloads(), 1);
  });
});

test("nothing suitable is a final 'none', and the empty answer is not asked for again within the day", async () => {
  await withDirectory(async (directory) => {
    const scripted = scriptedFetch({ search: () => searchAnswer([hit(1, "mountain, snow, yunnan"), hit(2, "jade dragon, japan")]) });
    const first = finder(directory, scripted);
    assert.deepEqual(await first.find(yulong, first.startBatch()), { status: "none" });
    assert.equal(scripted.searches(), 2);
    assert.equal(scripted.downloads(), 0);
    const restarted = finder(directory, scripted);
    assert.deepEqual(await restarted.find(yulong, restarted.startBatch()), { status: "none" });
    assert.equal(scripted.searches(), 2);
  });
});

test("a network failure is 'unavailable', is not cached, and is tried again only after a pause", async () => {
  await withDirectory(async (directory) => {
    let online = false;
    const scripted = scriptedFetch({ search: () => {
      if (!online) throw new TypeError("fetch failed");
      return searchAnswer([hit(42, "jade dragon snow mountain, china")]);
    } });
    const clock = { now: Date.parse("2026-10-24T00:00:00Z") };
    const flaky = finder(directory, scripted, clock);
    assert.deepEqual(await flaky.find(yulong, flaky.startBatch()), { status: "unavailable", reason: "transient" });
    online = true;
    // A reload straight away does not ask again.
    assert.deepEqual(await flaky.find(yulong, flaky.startBatch()), { status: "unavailable", reason: "retry_later" });
    assert.equal(scripted.searches(), 1);
    clock.now += 11 * 60 * 1000;
    assert.equal((await flaky.find(yulong, flaky.startBatch())).status, "found");
  });
});

test("a failed download is not a 'no photo' either", async () => {
  await withDirectory(async (directory) => {
    const scripted = scriptedFetch({ search: () => searchAnswer([hit(42, "jade dragon snow mountain, china")]),
      download: () => new Response("", { status: 503 }) });
    const broken = finder(directory, scripted);
    assert.deepEqual(await broken.find(yulong, broken.startBatch()), { status: "unavailable", reason: "transient" });
  });
});

test("a rate limit stops every other card in the set, and the server pauses before asking again", async () => {
  await withDirectory(async (directory) => {
    const scripted = scriptedFetch({ search: () => new Response("", { status: 429 }) });
    const limited = finder(directory, scripted);
    const batch = limited.startBatch();
    assert.deepEqual(await limited.find(yulong, batch), { status: "unavailable", reason: "rate_limited" });
    const lugu: RemotePhotoSubject = { province: "云南省", region: "丽江市", landmark: "泸沽湖", english: "Lugu Lake" };
    assert.deepEqual(await limited.find(lugu, batch), { status: "unavailable", reason: "paused" });
    assert.deepEqual(await limited.find(lugu, limited.startBatch()), { status: "unavailable", reason: "paused" });
    assert.equal(scripted.searches(), 1);
  });
});

test("one set of cards cannot spend more than its search budget", async () => {
  await withDirectory(async (directory) => {
    const scripted = scriptedFetch({ search: () => searchAnswer([]) });
    const bounded = finder(directory, scripted);
    const batch = bounded.startBatch();
    const results = await Promise.all(Array.from({ length: 6 }, (_, index) =>
      bounded.find({ province: "云南省", region: "丽江市", landmark: `景点${index}`, english: `Sight Number${index}` }, batch)));
    assert.equal(scripted.searches(), 8);
    assert.ok(results.some((result) => result.status === "unavailable" && result.reason === "batch_budget"));
  });
});

test("one landmark downloads at most two candidates, and a 'none' it reached is not downloaded again within the day", async () => {
  await withDirectory(async (directory) => {
    const scripted = scriptedFetch({
      search: () => searchAnswer([1, 2, 3].map((id) => hit(id, "jade dragon snow mountain, yunnan"))),
      download: () => new Response("<html>", { headers: { "content-type": "text/html" } }),
    });
    const clock = { now: Date.parse("2026-10-24T00:00:00Z") };
    const first = finder(directory, scripted, clock);
    assert.deepEqual(await first.find(yulong, first.startBatch()), { status: "none" });
    assert.equal(scripted.downloads(), 2);
    const restarted = finder(directory, scripted, clock);
    assert.deepEqual(await restarted.find(yulong, restarted.startBatch()), { status: "none" });
    assert.equal(scripted.downloads(), 2);
    clock.now += 25 * 60 * 60 * 1000;
    await restarted.find(yulong, restarted.startBatch());
    assert.equal(scripted.downloads(), 4);
  });
});
