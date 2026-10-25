import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { MediaPhotoStore } from "./media-photo-store";
import { fakeJpeg } from "./pixabay-test-fixtures";
import type { RemotePhotoSubject } from "./remote-photo-finder";
import { WikimediaClient, type CommonsFile } from "./wikimedia-client";
import { landmarkQuery, rankedImages, refusalOf, WikimediaPhotoFinder } from "./wikimedia-photo-finder";

const yulong: RemotePhotoSubject = { province: "云南省", region: "丽江市", landmark: "玉龙雪山", english: "Jade Dragon Snow Mountain" };

function sparqlRow(item: string, file: string, name: string, rank: "1" | "2" = "1") {
  return { item: { value: `http://www.wikidata.org/entity/${item}` },
    image: { value: `http://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}` },
    name: { value: name }, rank: { value: rank } };
}

function commonsAnswer(overrides: Record<string, unknown> = {}, meta: Record<string, string> = {}) {
  return { query: { pages: [{ pageid: 321, title: "File:Yulong.jpg", imageinfo: [{
    thumburl: "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Yulong.jpg/500px-Yulong.jpg?utm_source=commons.wikimedia.org",
    descriptionurl: "https://commons.wikimedia.org/wiki/File:Yulong.jpg", width: 4000, height: 2600, mime: "image/jpeg",
    extmetadata: Object.fromEntries(Object.entries({ Artist: "<a href=\"//commons.wikimedia.org/wiki/User:X\">Some One</a>",
      LicenseShortName: "CC BY-SA 4.0", LicenseUrl: "https://creativecommons.org/licenses/by-sa/4.0", ...meta })
      .map(([name, value]) => [name, { value }])), ...overrides }] }] } };
}

interface Script {
  sparql?: () => Response | Promise<Response>;
  commons?: () => Response | Promise<Response>;
  download?: () => Response | Promise<Response>;
}

function scripted(answer: Script) {
  const asked: string[] = [];
  const agents: string[] = [];
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    asked.push(url.hostname);
    agents.push(new Headers(init?.headers).get("User-Agent") ?? "");
    if (url.hostname === "query.wikidata.org") {
      return answer.sparql ? answer.sparql() : Response.json({ results: { bindings: [] } });
    }
    if (url.hostname === "commons.wikimedia.org") return answer.commons ? answer.commons() : Response.json(commonsAnswer());
    return answer.download ? answer.download()
      : new Response(fakeJpeg(500, 325) as BodyInit, { headers: { "content-type": "image/jpeg" } });
  }) as typeof fetch;
  return { fetcher, asked, agents };
}

async function withDirectory(run: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "meri-wikimedia-"));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function finder(directory: string, fetcher: typeof fetch, clock = { now: Date.parse("2026-10-24T00:00:00Z") }) {
  return new WikimediaPhotoFinder({ client: new WikimediaClient({ fetcher, now: () => clock.now }),
    store: new MediaPhotoStore(directory), now: () => clock.now });
}

const found = () => Response.json({ results: { bindings: [sparqlRow("Q1153", "Yulong.jpg", "玉龙雪山")] } });

test("the landmark's Wikidata image is fetched with its licence, kept, credited, and answered from disk after a restart", async () => {
  await withDirectory(async (directory) => {
    const first = scripted({ sparql: found });
    const lookup = finder(directory, first.fetcher);
    const result = await lookup.find(yulong, lookup.startBatch());
    assert.deepEqual(result, { status: "found", image: { url: "/media/place-photos/wikimedia-321.jpg", caption: "玉龙雪山",
      credit: "Photo: Some One / Wikimedia Commons, CC BY-SA 4.0" } });
    assert.deepEqual(first.asked, ["query.wikidata.org", "commons.wikimedia.org", "thumb.wikimedia.org"]);
    assert.ok(first.agents.every((agent) => agent.startsWith("MeriRoadTrip/")));

    const [record] = await new MediaPhotoStore(directory).listWikimediaRecords();
    assert.equal(record.item, "Q1153");
    assert.equal(record.license, "CC BY-SA 4.0");
    assert.equal(record.licenseUrl, "https://creativecommons.org/licenses/by-sa/4.0");
    assert.equal(record.pageUrl, "https://commons.wikimedia.org/wiki/File:Yulong.jpg");
    assert.equal(record.artist, "Some One");

    const after = scripted({ sparql: () => { throw new Error("must not ask"); } });
    const restarted = finder(directory, after.fetcher);
    assert.deepEqual(await restarted.find(yulong, restarted.startBatch()), result);
    assert.deepEqual(after.asked, []);
  });
});

test("no item of that name in that 市 is a 'none' kept for the day, under these rules", async () => {
  await withDirectory(async (directory) => {
    const clock = { now: Date.parse("2026-10-24T00:00:00Z") };
    const first = scripted({});
    const lookup = finder(directory, first.fetcher, clock);
    assert.deepEqual(await lookup.find(yulong, lookup.startBatch()), { status: "none" });
    assert.equal(await lookup.find(yulong, lookup.startBatch()).then((item) => item.status), "none");
    assert.deepEqual(first.asked, ["query.wikidata.org"]);
    clock.now += 25 * 60 * 60 * 1000;
    await lookup.find(yulong, lookup.startBatch());
    assert.equal(first.asked.length, 2);
  });
});

test("Wikimedia out of reach is 'unavailable', never saved, and pauses Wikimedia for the process", async () => {
  await withDirectory(async (directory) => {
    const clock = { now: Date.parse("2026-10-24T00:00:00Z") };
    const unreachable = scripted({ sparql: () => { throw new TypeError("fetch failed"); } });
    const lookup = finder(directory, unreachable.fetcher, clock);
    assert.deepEqual(await lookup.find(yulong, lookup.startBatch()), { status: "unavailable", reason: "transient" });
    const other: RemotePhotoSubject = { province: "云南省", region: "大理白族自治州", landmark: "洱海" };
    assert.deepEqual(await lookup.find(other, lookup.startBatch()), { status: "unavailable", reason: "paused" });
    assert.equal(unreachable.asked.length, 1);
    assert.equal(await new MediaPhotoStore(directory).recentlyNone(yulong, clock.now, 4, "wikimedia"), false);
    clock.now += 11 * 60 * 1000;
    await lookup.find(other, lookup.startBatch());
    assert.equal(unreachable.asked.length, 2);
  });
});

test("a file under a licence Meri cannot credit is passed over for the next image, and none at all is a 'none'", async () => {
  await withDirectory(async (directory) => {
    let commonsCalls = 0;
    const two = () => Response.json({ results: { bindings: [sparqlRow("Q1", "A.jpg", "玉龙雪山"), sparqlRow("Q2", "B.jpg", "玉龙雪山")] } });
    const scriptedFetch = scripted({ sparql: two, commons: () => {
      commonsCalls += 1;
      return Response.json(commonsAnswer({}, { LicenseShortName: commonsCalls === 1 ? "GFDL" : "CC BY-NC 2.0" }));
    } });
    const lookup = finder(directory, scriptedFetch.fetcher);
    assert.deepEqual(await lookup.find(yulong, lookup.startBatch()), { status: "none" });
    assert.equal(commonsCalls, 2);
    assert.equal(scriptedFetch.asked.includes("thumb.wikimedia.org"), false);
  });
});

test("a refusal or rate limit stops the whole set on Wikimedia", async () => {
  await withDirectory(async (directory) => {
    const limited = scripted({ sparql: () => new Response("", { status: 429, headers: { "retry-after": "30" } }) });
    const lookup = finder(directory, limited.fetcher);
    const batch = lookup.startBatch();
    assert.deepEqual(await lookup.find(yulong, batch), { status: "unavailable", reason: "rate_limited" });
    assert.equal(batch.stopped, "rate_limited");
    // The process-wide pause answers before the set's own stop is even read.
    assert.deepEqual(await lookup.find({ ...yulong, landmark: "泸沽湖", english: undefined }, batch),
      { status: "unavailable", reason: "paused" });
    assert.equal(limited.asked.length, 1);
  });
});

test("a set spends at most its budget of Wikidata queries; past it a card is asked again later", async () => {
  await withDirectory(async (directory) => {
    const empty = scripted({});
    const lookup = finder(directory, empty.fetcher);
    const batch = lookup.startBatch();
    const results = [];
    for (let index = 0; index < 14; index += 1) {
      results.push(await lookup.find({ province: "云南省", region: "丽江市", landmark: `景点${index}` }, batch));
    }
    assert.equal(empty.asked.length, 12);
    assert.deepEqual(results.slice(12), [{ status: "unavailable", reason: "batch_budget" },
      { status: "unavailable", reason: "batch_budget" }]);
  });
});

test("only images from Wikimedia's own image hosts are downloaded", async () => {
  await withDirectory(async (directory) => {
    const elsewhere = scripted({ sparql: found,
      commons: () => Response.json(commonsAnswer({ thumburl: "https://example.com/500px-Yulong.jpg" })) });
    const lookup = finder(directory, elsewhere.fetcher);
    assert.deepEqual(await lookup.find(yulong, lookup.startBatch()), { status: "none" });
    assert.equal(elsewhere.asked.includes("example.com"), false);
  });
});

test("the query pins the landmark to its 市 and the 市 to its province, and no name can break out of its string", () => {
  const query = landmarkQuery({ ...yulong, aliases: ["玉龙\"} . ?x ?y ?z {\"", "Yulong"] }) ?? "";
  assert.match(query, /"玉龙雪山"@zh/u);
  assert.match(query, /"Jade Dragon Snow Mountain"@en/u);
  assert.match(query, /"丽江市"@zh "丽江市"@zh-hans "丽江市"@zh-cn "丽江"@zh/u);
  assert.match(query, /VALUES \?provinceName \{ "云南省"@zh "云南省"@zh-hans "云南省"@zh-cn \}/u);
  assert.match(query, /\?item wdt:P131\+ \?region/u);
  assert.match(query, /"玉龙\\"\} \. \?x \?y \?z \{\\""@zh/u);
  const chongqing = landmarkQuery({ province: "重庆市", region: "重庆市", landmark: "洪崖洞" }) ?? "";
  assert.doesNotMatch(chongqing, /\?province/u);
  assert.match(chongqing, /\?region wdt:P17 wd:Q148\./u);
  // 吉林市 shares its short name with 吉林省 but is an ordinary 市: its province is still checked.
  const jilin = landmarkQuery({ province: "吉林省", region: "吉林市", landmark: "松花湖" }) ?? "";
  assert.match(jilin, /VALUES \?provinceName \{ "吉林省"@zh/u);
  assert.doesNotMatch(jilin, /wdt:P17/u);
});

test("the landmark's own Chinese label ranks first, then other labels, then aliases; the older item breaks a tie", () => {
  const ranked = rankedImages([
    { item: "http://www.wikidata.org/entity/Q9", image: "x/Alias.jpg", name: "玉龙雪山", rank: "2" },
    { item: "http://www.wikidata.org/entity/Q50", image: "x/English.jpg", name: "Jade Dragon Snow Mountain", rank: "1" },
    { item: "http://www.wikidata.org/entity/Q70", image: "x/Late.jpg", name: "玉龙雪山", rank: "1" },
    { item: "http://www.wikidata.org/entity/Q60", image: "x/Own%20name.jpg", name: "玉龙雪山", rank: "1" },
  ], yulong);
  assert.deepEqual(ranked.map((image) => image.file), ["Own name.jpg", "Late.jpg", "English.jpg", "Alias.jpg"]);
});

test("Commons files are refused for a licence, author, shape or kind Meri cannot use", () => {
  const good: CommonsFile = { pageId: 1, title: "File:A.jpg", pageUrl: "https://commons.wikimedia.org/wiki/File:A.jpg",
    width: 4000, height: 2600, mime: "image/jpeg", thumbUrl: "https://upload.wikimedia.org/a.jpg", artist: "A",
    license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0", nonFree: false };
  assert.equal(refusalOf(good), null);
  assert.equal(refusalOf({ ...good, license: "CC BY 3.0 cn" }), null);
  assert.equal(refusalOf({ ...good, license: "Public domain", artist: "", licenseUrl: "" }), null);
  assert.equal(refusalOf({ ...good, license: "CC0", artist: "" }), null);
  assert.equal(refusalOf({ ...good, license: "GFDL" }), "licence");
  assert.equal(refusalOf({ ...good, license: "CC BY-NC-SA 4.0" }), "licence");
  assert.equal(refusalOf({ ...good, nonFree: true }), "licence");
  assert.equal(refusalOf({ ...good, artist: "" }), "no_author");
  assert.equal(refusalOf({ ...good, width: 2000, height: 3000 }), "shape");
  assert.equal(refusalOf({ ...good, mime: "image/svg+xml" }), "not_a_photo");
});
