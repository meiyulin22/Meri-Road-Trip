import assert from "node:assert/strict";
import test from "node:test";

import { createTiandituClient, type TiandituAnswer, type TiandituClient } from "./tianditu-fetch";
import { candidateFromArea, candidateFromPoi, TiandituLocationProvider, tiandituKind, wholePlacesFirst } from "./tianditu-location-provider";

/** A detailed (`show: "2"`) POI as Tianditu answered on 2026-10-22. */
const xishan = {
  name: "苍山", hotPointID: "F62357388B9FD2F2", lonlat: "109.022369,23.173218", address: "南宁市宾阳县王灵镇",
  province: "广西壮族自治区", city: "南宁市", county: "宾阳县", typeCode: "260203", typeName: "山",
};
const geopark = {
  name: "苍山世界地质公园", hotPointID: "GEO1", lonlat: "100.12,25.72", address: "大理市",
  province: "云南省", city: "大理白族自治州", county: "大理市", typeCode: "180301", typeName: "公园", distance: "3.2km",
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

test("one search, and Tianditu's own page stands with a whole scenic area moved to the front", async () => {
  const shop = { ...xishan, name: "苍山饭店", hotPointID: "SHOP", typeCode: "110101" };
  const tianditu = client(() => ok({ resultType: 1, pois: [shop, geopark] }));
  const result = await new TiandituLocationProvider(tianditu).searchByKeyword("苍山");
  assert.deepEqual(result.status === "success" && result.candidates.map((place) => place.name), ["苍山世界地质公园"]);
  // Exactly one request: no fame lookup sits in front of the search any more.
  assert.deepEqual(tianditu.calls, ["/v2/search:1"]);
});

test("a 市 answer takes its province from reverse geocoding; a province answer needs none", async () => {
  const city = client((path) => path === "/geocoder"
    ? ok({ result: { addressComponent: { province: "云南省", city: "丽江市", county: "古城区" } } })
    : ok({ resultType: 3, area: { name: "丽江市", adminCode: 156530700, lonlat: "100.22,26.85" } }));
  const cityResult = await new TiandituLocationProvider(city).searchByKeyword("丽江");
  assert.deepEqual(cityResult.status === "success" &&
    [cityResult.candidates[0].province, cityResult.candidates[0].city], ["云南省", "丽江市"]);
  assert.deepEqual(city.calls, ["/v2/search:1", "/geocoder:geocode"]);

  const province = client(() => ok({ resultType: 3, area: { name: "云南省", adminCode: 156530000, lonlat: "100.5,25" } }));
  const provinceResult = await new TiandituLocationProvider(province).searchByKeyword("云南");
  assert.deepEqual(provinceResult.status === "success" &&
    [provinceResult.candidates[0].name, provinceResult.candidates[0].province], ["云南省", "云南省"]);
  assert.deepEqual(province.calls, ["/v2/search:1"]);
});

test("an area answer whose reverse geocoding fails is a failure, not a place without a province", async () => {
  const tianditu = client((path) => path === "/geocoder"
    ? ok({})
    : ok({ resultType: 3, area: { name: "丽江市", adminCode: 156530700, lonlat: "100.22,26.85" } }));
  const result = await new TiandituLocationProvider(tianditu).searchByKeyword("丽江");
  assert.deepEqual(result, { status: "failure", reason: "network_or_response_error" });
});

test("no data is an empty answer; a refusal or a missing key is a failure", async () => {
  const none = await new TiandituLocationProvider(client(() => ({ ok: true, body: { status: { infocode: 3001 } } })))
    .searchByKeyword("没有这个地方");
  assert.deepEqual(none, { status: "success", candidates: [] });
  const refused = await new TiandituLocationProvider(client(() => ({ ok: false, reason: "refused" })))
    .searchByKeyword("苍山");
  assert.deepEqual(refused, { status: "failure", reason: "network_or_response_error" });
  const blank = await new TiandituLocationProvider(client(() => ok({}))).searchByKeyword("  ");
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
