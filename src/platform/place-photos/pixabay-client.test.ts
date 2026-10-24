import assert from "node:assert/strict";
import test from "node:test";

import { PixabayClient } from "./pixabay-client";
import { fakeJpeg, hit, scriptedFetch, searchAnswer } from "./pixabay-test-fixtures";

const query = new URLSearchParams({ q: "Lugu Lake", image_type: "photo" });

test("a search sends the key only in the request and keeps only the fields Meri reads", async () => {
  const scripted = scriptedFetch({ search: () => searchAnswer([{ ...hit(1, "lugu lake"), extra: "x" } as never]) });
  const outcome = await new PixabayClient({ key: "secret-key", fetcher: scripted.fetcher }).search(query);
  assert.equal(outcome.ok, true);
  assert.deepEqual(outcome.ok && Object.keys(outcome.hits[0]).sort(),
    ["id", "imageHeight", "imageWidth", "pageURL", "tags", "user", "webformatURL"]);
  assert.match(scripted.asked[0], /key=%5BKEY%5D/u);
  assert.doesNotMatch(JSON.stringify(outcome), /secret-key/u);
});

test("a refused key, a rate limit and a broken answer are told apart", async () => {
  const answers: Record<string, () => Response> = {
    refused: () => new Response("[ERROR 400] Invalid or missing API key", { status: 400 }),
    rate_limited: () => new Response("", { status: 429 }),
    transient: () => new Response("{\"hits\": \"nope\"}", { status: 200 }),
  };
  for (const [failure, answer] of Object.entries(answers)) {
    const client = new PixabayClient({ key: "k", fetcher: scriptedFetch({ search: answer }).fetcher });
    assert.deepEqual(await client.search(query), { ok: false, failure }, failure);
  }
  const offline = new PixabayClient({ key: "k", fetcher: (async () => { throw new TypeError("fetch failed"); }) as typeof fetch });
  assert.deepEqual(await offline.search(query), { ok: false, failure: "transient" });
});

test("downloads come only from Pixabay's hosts, redirects included", async () => {
  const client = new PixabayClient({ key: "k", fetcher: scriptedFetch({ download: (url) => url.includes("redirect")
    ? new Response(null, { status: 302, headers: { location: "https://evil.example/photo.jpg" } })
    : new Response(fakeJpeg(960, 640) as BodyInit, { headers: { "content-type": "image/jpeg" } }) }).fetcher });
  assert.deepEqual(await client.download("https://evil.example/a.jpg"), { ok: false, failure: "unsuitable" });
  assert.deepEqual(await client.download("http://cdn.pixabay.com/a.jpg"), { ok: false, failure: "unsuitable" });
  assert.deepEqual(await client.download("https://cdn.pixabay.com/redirect.jpg"), { ok: false, failure: "unsuitable" });
  assert.equal((await client.download("https://cdn.pixabay.com/a.jpg")).ok, true);
});

test("a download is cut off at the byte cap even when the server does not say its length", async () => {
  const big = new ReadableStream<Uint8Array>({ pull(controller) { controller.enqueue(new Uint8Array(64 * 1024)); } });
  const client = new PixabayClient({ key: "k", maxDownloadBytes: 256 * 1024, fetcher: scriptedFetch({
    download: () => new Response(big, { headers: { "content-type": "image/jpeg" } }) }).fetcher });
  assert.deepEqual(await client.download("https://cdn.pixabay.com/a.jpg"), { ok: false, failure: "unsuitable" });
  const html = new PixabayClient({ key: "k", fetcher: scriptedFetch({
    download: () => new Response("<html>", { headers: { "content-type": "text/html" } }) }).fetcher });
  assert.deepEqual(await html.download("https://cdn.pixabay.com/a.jpg"), { ok: false, failure: "unsuitable" });
});

test("requests go one at a time, and past the queue limit one is turned away instead of waiting", async () => {
  let active = 0;
  let most = 0;
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const client = new PixabayClient({ key: "k", maxQueue: 1, fetcher: scriptedFetch({ search: async () => {
    active += 1;
    most = Math.max(most, active);
    await gate;
    active -= 1;
    return searchAnswer([]);
  } }).fetcher });
  const first = client.search(query);
  const second = client.search(query);
  assert.deepEqual(await client.search(query), { ok: false, failure: "transient" });
  release();
  await Promise.all([first, second]);
  assert.equal(most, 1);
});

test("a malformed hit is dropped on its own instead of failing the whole answer", async () => {
  const client = new PixabayClient({ key: "k", fetcher: scriptedFetch({ search: () => Response.json({ hits: [
    hit(1, "yuanyang, rice terraces, china", { tags: `yuanyang, ${"terraces, ".repeat(55)}` }),
    { id: "x" }, hit(2, "x".repeat(1001)),
  ] }) }).fetcher });
  const outcome = await client.search(query);
  assert.deepEqual(outcome.ok && outcome.hits.map((item) => item.id), [1]);
});
