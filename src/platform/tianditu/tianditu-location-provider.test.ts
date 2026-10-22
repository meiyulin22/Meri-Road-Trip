import assert from "node:assert/strict";
import test from "node:test";

import type { FamousSight, FamousSightFinder } from "@/platform/wikidata/wikidata-sights";

import { createTiandituClient, type TiandituAnswer, type TiandituClient } from "./tianditu-fetch";
import { candidateFromArea, candidateFromPoi, nearbySightNamed, TiandituLocationProvider, tiandituKind, wholePlacesFirst } from "./tianditu-location-provider";

/** A detailed (`show: "2"`) POI as Tianditu answered on 2026-10-22. */
const xishan = {
  name: "苍山", hotPointID: "F62357388B9FD2F2", lonlat: "109.022369,23.173218", address: "南宁市宾阳县王灵镇",
  province: "广西壮族自治区", city: "南宁市", county: "宾阳县", typeCode: "260203", typeName: "山",
};
const geopark = {
  name: "苍山世界地质公园", hotPointID: "GEO1", lonlat: "100.12,25.72", address: "大理市",
  province: "云南省", city: "大理白族自治州", county: "大理市", typeCode: "180301", typeName: "公园", distance: "3.2km",
};
const cangshan: FamousSight = {
  id: "Q844493", label: "苍山", englishLabel: "Cangshan", longitude: 100.1, latitude: 25.7, image: "Cangshan.jpg", editions: 13,
};

function client(answers: (path: string, postStr: Record<string, unknown>) => TiandituAnswer): TiandituClient & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async get(path, params) {
      const postStr = JSON.parse(params.postStr) as Record<string, unknown>;
      calls.push(`${path}:${String(postStr.queryType ?? "geocode")}`);
      return answers(path, postStr);
    },
  };
}

function finder(sight: FamousSight | null): FamousSightFinder {
  return { findFamousSight: async () => (sight ? { status: "found", sight } : { status: "unavailable" }) };
}

const ok = (body: Record<string, unknown>): TiandituAnswer => ({ ok: true, body: { status: { infocode: 1000 }, ...body } });

test("Tianditu's categories map to sight or other, and its POIs to Meri candidates", () => {
  assert.equal(tiandituKind("180400"), "sight");
  assert.equal(tiandituKind("260203"), "sight");
  assert.equal(tiandituKind("110101"), "other");
  assert.equal(tiandituKind("260108"), "other");
  assert.equal(tiandituKind(undefined), undefined);
  assert.deepEqual(candidateFromPoi(xishan), {
    providerId: "F62357388B9FD2F2", name: "苍山", province: "广西壮族自治区", city: "南宁市", district: "宾阳县",
    region: "广西壮族自治区 南宁市 宾阳县", address: "南宁市宾阳县王灵镇", longitude: 109.022369, latitude: 23.173218,
    coordinateSystem: "CGCS2000", kind: "sight",
  });
  // A 直辖市 is its own 市, as Amap files it.
  assert.equal(candidateFromPoi({ ...xishan, name: "故宫博物院", province: "北京市", city: "", county: "东城区" })?.city, "北京市");
  assert.equal(candidateFromPoi({ ...xishan, lonlat: "far away" }), null);
  // Filed as a county-level place name, but a scenic area by its name.
  assert.equal(candidateFromPoi({ ...xishan, name: "黄山风景区", typeCode: "260108" })?.kind, "sight");
});

test("an administrative answer takes its level from its code and the levels above from reverse geocoding", () => {
  const around = { province: "云南省", city: "大理白族自治州", district: "大理市" };
  assert.equal(candidateFromArea({ name: "云南省", adminCode: 156530000, lonlat: "100.5,25" }, around)?.province, "云南省");
  const city = candidateFromArea({ name: "丽江市", adminCode: 156530700, lonlat: "100.2,26.8" }, { ...around, city: "丽江市" });
  assert.deepEqual([city?.province, city?.city, city?.district], ["云南省", "丽江市", null]);
  const county = candidateFromArea({ name: "大理市", adminCode: 156532901, lonlat: "100.2,25.6" }, around);
  assert.deepEqual([county?.province, county?.city, county?.district], ["云南省", "大理白族自治州", "大理市"]);
  assert.equal(candidateFromArea({ name: "火星", adminCode: 1, lonlat: "1,1" }, around), null);
});

test("near Wikidata's point, the sight named exactly is chosen over its parts and its neighbours", () => {
  const pois = [
    { ...geopark, name: "苍山中和索道", hotPointID: "A", distance: "1km" },
    { ...geopark, name: "苍山-公交站", hotPointID: "B", typeCode: "180400" },
    { ...geopark, name: "苍山", hotPointID: "C", distance: "6km", typeCode: "260203" },
    { ...geopark, name: "苍山饭店", hotPointID: "D", typeCode: "110101" },
  ];
  assert.equal(nearbySightNamed("苍山", pois)?.providerId, "C");
  assert.equal(nearbySightNamed("苍山", [pois[0], geopark])?.name, "苍山世界地质公园");
  assert.equal(nearbySightNamed("苍山", [pois[1], pois[3]]), null);
  // A part carrying the name is not the place: Wikidata's own point stands in instead.
  assert.equal(nearbySightNamed("苍山", [pois[0]]), null);
});

test("the famous sight is found around Wikidata's point and offered first", async () => {
  const tianditu = client((path, post) => post.queryType === "3"
    ? ok({ pois: [geopark] })
    : ok({ resultType: 1, pois: [xishan] }));
  const result = await new TiandituLocationProvider(tianditu, finder(cangshan)).searchByKeyword("苍山");
  assert.equal(result.status, "success");
  if (result.status !== "success") return;
  // Guangxi's 苍山 is not what the user meant once Dali's is known.
  assert.deepEqual(result.candidates.map((place) => place.name), ["苍山世界地质公园"]);
  assert.deepEqual(tianditu.calls, ["/v2/search:1", "/v2/search:3"]);
});

test("a sight Tianditu already found near Wikidata's point moves to the front without another search", async () => {
  const daliCangshan = { ...xishan, hotPointID: "DALI", lonlat: "100.11,25.71", province: "云南省", city: "大理白族自治州", county: "大理市" };
  const tianditu = client(() => ok({ resultType: 1, pois: [xishan, daliCangshan] }));
  const result = await new TiandituLocationProvider(tianditu, finder(cangshan)).searchByKeyword("苍山");
  assert.deepEqual(result.status === "success" && result.candidates.map((place) => place.providerId), ["DALI"]);
  assert.deepEqual(tianditu.calls, ["/v2/search:1"]);
});

test("without Wikidata, or for words that are not a sight's exact name, Tianditu's own order stands", async () => {
  const tianditu = client(() => ok({ resultType: 1, pois: [xishan] }));
  const unreachable = await new TiandituLocationProvider(tianditu, finder(null)).searchByKeyword("苍山");
  assert.deepEqual(unreachable.status === "success" && unreachable.candidates.map((place) => place.name), ["苍山"]);
  const otherName = await new TiandituLocationProvider(tianditu, finder({ ...cangshan, label: "点苍山" })).searchByKeyword("苍山");
  assert.deepEqual(otherName.status === "success" && otherName.candidates.length, 1);
});

test("a sight Tianditu has no point for is offered at Wikidata's point, still in CGCS2000", async () => {
  const tianditu = client((path, post) => path === "/geocoder"
    ? ok({ result: { addressComponent: { province: "云南省", city: "大理白族自治州", county: "大理市" } } })
    : post.queryType === "3" ? ok({ pois: [] }) : ok({ resultType: 1, pois: [xishan] }));
  const result = await new TiandituLocationProvider(tianditu, finder(cangshan)).searchByKeyword("苍山");
  assert.equal(result.status === "success" && result.candidates[0].providerId, "wikidata:Q844493");
  assert.equal(result.status === "success" && result.candidates[0].city, "大理白族自治州");
  assert.equal(result.status === "success" && result.candidates[0].coordinateSystem, "CGCS2000");
});

test("an area answer for a sight's name also offers the sight, as Amap answers 峨眉山", async () => {
  const tianditu = client((path, post) => path === "/geocoder"
    ? ok({ result: { addressComponent: { province: "四川省", city: "乐山市", county: "峨眉山市" } } })
    : post.queryType === "3"
      ? ok({ pois: [{ ...geopark, name: "峨眉山", hotPointID: "EMEI", province: "四川省", city: "乐山市", county: "峨眉山市", typeCode: "260200" }] })
      : ok({ resultType: 3, area: { name: "峨眉山市", adminCode: 156511181, lonlat: "103.48,29.6" } }));
  const emei = { ...cangshan, id: "Q134927", label: "峨眉山" };
  const result = await new TiandituLocationProvider(tianditu, finder(emei)).searchByKeyword("峨眉山");
  assert.deepEqual(result.status === "success" && result.candidates.map((place) => place.name), ["峨眉山", "峨眉山市"]);
});

test("no data is an empty answer; a refusal or a missing key is a failure", async () => {
  const none = await new TiandituLocationProvider(client(() => ({ ok: true, body: { status: { infocode: 3001 } } })), finder(null))
    .searchByKeyword("没有这个地方");
  assert.deepEqual(none, { status: "success", candidates: [] });
  const refused = await new TiandituLocationProvider(client(() => ({ ok: false, reason: "refused" })), finder(null))
    .searchByKeyword("苍山");
  assert.deepEqual(refused, { status: "failure", reason: "network_or_response_error" });
  const blank = await new TiandituLocationProvider(client(() => ok({})), finder(null)).searchByKeyword("  ");
  assert.deepEqual(blank, { status: "failure", reason: "invalid_query" });
});

test("the client sends the key only to Tianditu and reads a firewall page as a refusal", async () => {
  const original = process.env.TIANDITU_API_KEY;
  process.env.TIANDITU_API_KEY = "test-tianditu-key";
  try {
    let requested: URL | undefined;
    const page = createTiandituClient(async (input) => {
      requested = new URL(String(input));
      return new Response("<!DOCTYPE html><title>访问被拦截！</title>", { status: 200 });
    }, { gate: { run: (task) => task(), pause: () => undefined } });
    assert.deepEqual(await page.get("/v2/search", { type: "query", postStr: "{}" }), { ok: false, reason: "refused" });
    assert.equal(requested?.origin, "https://api.tianditu.gov.cn");
    assert.equal(requested?.searchParams.get("tk"), "test-tianditu-key");
    delete process.env.TIANDITU_API_KEY;
    assert.deepEqual(await page.get("/geocoder", {}), { ok: false, reason: "missing_configuration" });
  } finally {
    if (original === undefined) delete process.env.TIANDITU_API_KEY;
    else process.env.TIANDITU_API_KEY = original;
  }
});

test("a whole scenic area moves first, and the shops that borrowed its name drop out", () => {
  const restaurant = candidateFromPoi({ ...xishan, name: "洪崖洞", hotPointID: "R1", typeCode: "110101" });
  const scenic = candidateFromPoi({ ...xishan, name: "洪崖洞民俗风貌区", hotPointID: "S1", typeCode: "180400" });
  const trail = candidateFromPoi({ ...xishan, name: "洪崖洞巴渝古道", hotPointID: "S2", typeCode: "180400" });
  const found = [restaurant, trail, scenic].filter((place) => place !== null);
  assert.deepEqual(wholePlacesFirst("洪崖洞", found).map((place) => place.providerId), ["S1", "S2"]);
  // With no whole place to point to, Tianditu's page is left as it was.
  assert.deepEqual(wholePlacesFirst("洪崖洞", [restaurant, trail].filter((place) => place !== null))
    .map((place) => place.providerId), ["R1", "S2"]);
});

test("a scenic area the nearby search misses is found by name inside the sight's 市", async () => {
  const huangshan: FamousSight = { ...cangshan, id: "Q36034", label: "黄山", longitude: 118.1667, latitude: 30.125 };
  const scenicArea = { ...xishan, name: "黄山风景区", hotPointID: "HS", lonlat: "118.16,30.13",
    province: "安徽省", city: "黄山市", county: "黄山区", typeCode: "260108" };
  const tianditu = client((path, post) => {
    if (path === "/geocoder") return ok({ result: { addressComponent: { province: "安徽省", city: "黄山市", county: "黄山区" } } });
    if (post.queryType === "3") return ok({ pois: [{ ...xishan, name: "莲蕊峰", hotPointID: "PEAK", typeCode: "180400" }] });
    if (post.queryType === "12") return ok({ pois: [scenicArea] });
    return ok({ resultType: 3, area: { name: "黄山市", adminCode: 156341000, lonlat: "118.33,29.71" } });
  });
  const result = await new TiandituLocationProvider(tianditu, finder(huangshan)).searchByKeyword("黄山");
  assert.deepEqual(result.status === "success" && result.candidates.map((place) => place.name), ["黄山风景区", "黄山市"]);
});
