import assert from "node:assert/strict";
import test from "node:test";

import { famousSightAmong, namesTheSight, wikimediaHeaders, WikidataSights } from "./wikidata-sights";

const claim = (value: unknown) => [{ mainsnak: { datavalue: { value } } }];
const inChina = { P17: claim({ id: "Q148" }) };
const editions = (count: number) => Object.fromEntries(Array.from({ length: count }, (_, index) => [`wiki${index}`, {}]));

/** The two 苍山 that Wikidata held on 2026-10-22: 兰陵县 (once 苍山县) has more editions than Dali's. */
const lanling = { id: "Q1033215", labels: { "zh-hans": { value: "苍山" } }, sitelinks: editions(18),
  claims: { ...inChina, P625: claim({ latitude: 34.85, longitude: 118.04 }), P442: claim("371324") } };
const dali = { id: "Q844493", labels: { "zh-hans": { value: "苍山" }, en: { value: "Cangshan" } }, sitelinks: editions(13),
  claims: { ...inChina, P625: claim({ latitude: 25.7, longitude: 100.1 }), P18: claim("Cangshan.jpg") } };

test("the famous sight is the most written-about one that is not an administrative area or airport", () => {
  assert.deepEqual(famousSightAmong([lanling, dali]), {
    id: "Q844493", label: "苍山", englishLabel: "Cangshan", longitude: 100.1, latitude: 25.7, image: "Cangshan.jpg", editions: 13,
  });
  const airport = { ...dali, id: "Q1708704", sitelinks: editions(23), claims: { ...dali.claims, P238: claim("DCY") } };
  assert.equal(famousSightAmong([airport, dali])?.id, "Q844493");
  const abroad = { ...dali, claims: { ...dali.claims, P17: claim({ id: "Q17" }) } };
  assert.equal(famousSightAmong([abroad]), null);
  const nowhere = { ...dali, claims: { ...inChina } };
  assert.equal(famousSightAmong([nowhere]), null);
});

test("answers are cached, and an unreachable Wikidata is \"unavailable\", asked again later", async () => {
  let calls = 0;
  const immediate = { run: <T>(task: () => Promise<T>) => task(), pause: () => undefined };
  const reachable = new WikidataSights(async (input) => {
    calls += 1;
    const url = new URL(String(input));
    return Response.json(url.searchParams.get("action") === "wbsearchentities"
      ? { search: [{ id: "Q1033215" }, { id: "Q844493" }] }
      : { entities: { Q1033215: lanling, Q844493: dali } });
  }, Date.now, 4_000, immediate);
  const found = await reachable.findFamousSight("苍山");
  assert.equal(found.status === "found" && found.sight.id, "Q844493");
  assert.equal((await reachable.findFamousSight(" 苍山 ")).status, "found");
  assert.equal(calls, 2);

  let attempts = 0;
  const blocked = new WikidataSights(async () => {
    attempts += 1;
    throw new TypeError("fetch failed");
  }, Date.now, 4_000, immediate);
  assert.deepEqual(await blocked.findFamousSight("苍山"), { status: "unavailable" });
  assert.deepEqual(await blocked.findFamousSight("苍山"), { status: "unavailable" });
  assert.equal(attempts, 2);
});

test("a sight's name is the user's words, alone or with a scenic area's suffix", () => {
  assert.equal(namesTheSight("苍山", "苍山"), true);
  assert.equal(namesTheSight("九寨沟风景名胜区", "九寨沟"), true);
  assert.equal(namesTheSight("点苍山", "苍山"), false);
  assert.equal(namesTheSight("玉龙雪山", "玉龙"), false);
  assert.equal(namesTheSight("苍山饭店", "苍山"), false);
});

test("a Wikimedia token and contact go into the headers only when they are set", () => {
  assert.deepEqual(wikimediaHeaders({}), { "User-Agent": "MeriRoadTrip/1.0 (travel planning portfolio project)" });
  assert.deepEqual(wikimediaHeaders({ WIKIMEDIA_ACCESS_TOKEN: " t0ken ", WIKIMEDIA_CONTACT: "me@example.com" }), {
    "User-Agent": "MeriRoadTrip/1.0 (me@example.com)", Authorization: "Bearer t0ken",
  });
});
