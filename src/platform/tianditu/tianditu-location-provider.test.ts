import assert from "node:assert/strict";
import test from "node:test";

import { createTiandituClient, type TiandituAnswer, type TiandituClient } from "./tianditu-fetch";
import { ClassificationMemory } from "./classification-memory";
import { candidateFromArea, candidateFromPoi, TiandituLocationProvider, tiandituKind, wholePlacesFirst } from "./tianditu-location-provider";
import type { LocationCandidate } from "@/domain/location/location";

/** A detailed (`show: "2"`) POI as Tianditu answered on 2026-10-22. */
const xishan = {
  name: "苍山", hotPointID: "F62357388B9FD2F2", lonlat: "109.022369,23.173218", address: "南宁市宾阳县王灵镇",
  province: "广西壮族自治区", city: "南宁市", county: "宾阳县", typeCode: "260203", typeName: "山",
};
const geopark = {
  name: "苍山世界地质公园", hotPointID: "GEO1", lonlat: "100.12,25.72", address: "大理市",
  province: "云南省", city: "大理白族自治州", county: "大理市", typeCode: "180301", typeName: "公园", distance: "3.2km",
};

function client(answers: (path: string, postStr: Record<string, unknown>) => TiandituAnswer): TiandituClient & { calls: string[]; posts: Record<string, unknown>[] } {
  const calls: string[] = [];
  const posts: Record<string, unknown>[] = [];
  return {
    calls,
    posts,
    async get(path, params) {
      const postStr = JSON.parse(params.postStr) as Record<string, unknown>;
      posts.push(postStr);
      calls.push(`${path}:${String(postStr.queryType ?? "geocode")}`);
      return answers(path, postStr);
    },
  };
}

const ok = (body: Record<string, unknown>): TiandituAnswer => ({ ok: true, body: { status: { infocode: 1000 }, ...body } });

/** A provider with a disk-less cache, so one test's classification pages never reach the next. */
function newProvider(tianditu: TiandituClient): TiandituLocationProvider {
  return new TiandituLocationProvider(tianditu, new ClassificationMemory(null));
}

test("Tianditu's categories map to sight or other, and its POIs to Meri candidates", () => {
  // 180400 风景名胜, 2602xx 自然地物, 1602xx 文化场馆, 1803xx 公园类 — the official table's sights.
  assert.equal(tiandituKind("180400"), "sight");
  assert.equal(tiandituKind("260203"), "sight");
  assert.equal(tiandituKind("160203"), "sight");
  assert.equal(tiandituKind("180304"), "sight");
  // Not sights: 门牌信息 2603xx, 行政地名 2601xx, 休闲娱乐 1802xx, 市广场 180306, 运动场馆 1801xx.
  assert.equal(tiandituKind("260301"), "other");
  assert.equal(tiandituKind("260108"), "other");
  assert.equal(tiandituKind("180208"), "other");
  assert.equal(tiandituKind("180306"), "other");
  assert.equal(tiandituKind("180104"), "other");
  assert.equal(tiandituKind("110101"), "other");
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

test("a page whose first place is the whole sight is answered without the classification search", async () => {
  const shop = { ...xishan, name: "苍山饭店", hotPointID: "SHOP", typeCode: "110101" };
  const tianditu = client(() => ok({ resultType: 1, pois: [geopark, shop] }));
  const result = await newProvider(tianditu).searchByKeyword("苍山");
  assert.deepEqual(result.status === "success" && result.candidates.map((place) => place.name), ["苍山世界地质公园"]);
  // Exactly one request: the page already held the whole place.
  assert.deepEqual(tianditu.calls, ["/v2/search:1"]);
});

test("a page of airport, hotels and the scenic area's office is replaced by the district's scenic areas", async () => {
  const county = { province: "四川省", city: "甘孜藏族自治州", county: "稻城县" };
  const airport = { ...xishan, ...county, name: "稻城亚丁机场", hotPointID: "AIR", typeCode: "230109" };
  const office = { ...xishan, ...county, name: "稻城亚丁景区管理局", hotPointID: "OFFICE", typeCode: "190109" };
  const hotel = { ...xishan, ...county, name: "稻城亚丁暖南酒店", hotPointID: "HOTEL", typeCode: "120102" };
  const scenic = { ...xishan, ...county, name: "甘孜州稻城亚丁景区", hotPointID: "SCENIC", typeCode: "180400" };
  const tianditu = client((path, post) => post.queryType === "13"
    ? ok({ resultType: 1, pois: [scenic] })
    : ok({ resultType: 1, pois: [airport, hotel, office] }));
  const result = await newProvider(tianditu).searchByKeyword("稻城亚丁");
  assert.equal(result.status === "success" && result.candidates[0].name, "甘孜州稻城亚丁景区");
  // The national page, then one classification page: it named the place, so 山 is skipped.
  assert.deepEqual(tianditu.calls, ["/v2/search:1", "/v2/search:13"]);
});

test("the trip's own area decides where the clean list is asked for", async () => {
  const diancang = { ...xishan, name: "点苍山", hotPointID: "DIANCANG", typeCode: "260203",
    province: "云南省", city: "大理白族自治州", county: "大理市" };
  const shop = { ...xishan, name: "苍山饭店", hotPointID: "SHOP", typeCode: "110101" };
  // The national page leads with 广西's village, a whole place by name — but the trip is not
  // there, so the trip's own 市 is asked instead and 点苍山 comes back first.
  const tianditu = client((path, post) => post.queryType === "13"
    ? ok({ resultType: 1, pois: [diancang] })
    : ok({ resultType: 1, pois: [xishan, shop] }));
  const result = await newProvider(tianditu).searchByKeyword("苍山", ["云南省", "大理白族自治州"]);
  assert.equal(result.status === "success" && result.candidates[0].name, "点苍山");
  const specifies = tianditu.posts.filter((post) => post.queryType === "13").map((post) => post.specify);
  // The province is dropped — its own page never holds the place — and the trip's areas
  // replace the page's districts, which would otherwise put 宾阳县's 苍山 back in front.
  // One page only: 风景名胜 already named 点苍山, so 山 is not asked for.
  assert.deepEqual(specifies, ["大理白族自治州"]);
});

/** One category of a grouped classification answer, as Tianditu really shapes it. */
function page(pois: readonly Record<string, unknown>[], infocode = 1000): Record<string, unknown> {
  return { count: pois.length, pois, resultType: 1, lineData: [], status: { infocode, cndesc: infocode === 1000 ? "服务正常" : "错误" } };
}

test("both sight categories are fetched in one request, grouped by category", async () => {
  const diancang = { ...xishan, name: "点苍山", hotPointID: "DIANCANG", typeCode: "260203",
    province: "云南省", city: "大理白族自治州", county: "大理市" };
  const tianditu = client((path, post) => {
    if (post.queryType !== "13") return ok({ resultType: 1, pois: [xishan] });
    // The measured shape: one request, answered as an object keyed by category.
    return ok({ 风景名胜: page([]), 山: page([diancang]) });
  });
  const result = await newProvider(tianditu).searchByKeyword("苍山", ["云南省", "大理白族自治州"]);
  assert.equal(result.status === "success" && result.candidates[0].name, "点苍山");
  assert.deepEqual(tianditu.posts.filter((post) => post.queryType === "13").map((post) => post.dataTypes),
    ["风景名胜,山"]);
});

test("a cached page answers without another request", async () => {
  const diancang = { ...xishan, name: "点苍山", hotPointID: "DIANCANG", typeCode: "260203",
    province: "云南省", city: "大理白族自治州", county: "大理市" };
  const memory = new ClassificationMemory(null);
  const first = client((path, post) => post.queryType === "13"
    ? ok({ 风景名胜: page([diancang]), 山: page([diancang]) })
    : ok({ resultType: 1, pois: [xishan] }));
  await new TiandituLocationProvider(first, memory).searchByKeyword("苍山", ["大理白族自治州"]);
  const second = client(() => ok({ resultType: 1, pois: [xishan] }));
  const result = await new TiandituLocationProvider(second, memory).searchByKeyword("苍山", ["大理白族自治州"]);
  assert.equal(result.status === "success" && result.candidates[0].name, "点苍山");
  // Only the national page went out; both classification pages came from the cache.
  assert.deepEqual(second.calls, ["/v2/search:1"]);
});

test("a refused classification page is a failure, never a success with the national page", async () => {
  // 苍山's national page leads with 广西's village; answering with it because the clean list
  // was refused is exactly the wrong answer this path exists to prevent.
  const tianditu = client((path, post) => {
    if (post.queryType === "13") return { ok: false, reason: "refused" };
    return ok({ resultType: 1, pois: [xishan] });
  });
  const result = await newProvider(tianditu).searchByKeyword("苍山", ["云南省", "大理白族自治州"]);
  assert.deepEqual(result, { status: "failure", reason: "network_or_response_error" });
});

test("a refusal in one area ends the check, even though the next area would answer", async () => {
  const diancang = { ...xishan, name: "点苍山", hotPointID: "DIANCANG", typeCode: "260203",
    province: "云南省", city: "大理白族自治州", county: "大理市" };
  // A name no rule accepts as a whole place, so the clean list asks its district and 市.
  const gate = { ...xishan, name: "苍山石门关", hotPointID: "GATE" };
  let classificationCalls = 0;
  const tianditu = client((path, post) => {
    if (post.queryType === "13") {
      classificationCalls += 1;
      // The first area refused; the next area would have answered with a place. A partial
      // view must not pass as success, so the check stops instead of asking.
      return classificationCalls === 1
        ? { ok: false, reason: "refused" }
        : ok({ 风景名胜: page([diancang]), 山: page([]) });
    }
    return ok({ resultType: 1, pois: [gate] });
  });
  const result = await newProvider(tianditu).searchByKeyword("苍山");
  assert.equal(result.status, "failure");
  assert.equal(classificationCalls, 1);
});

test("an API-level error in a classification answer is a failure, not an empty page", async () => {
  const tianditu = client((path, post) => post.queryType === "13"
    ? ok({ 风景名胜: page([], 3000), 山: page([], 3000) })
    : ok({ resultType: 1, pois: [xishan] }));
  const result = await newProvider(tianditu).searchByKeyword("苍山", ["云南省", "大理白族自治州"]);
  assert.deepEqual(result, { status: "failure", reason: "api_or_response_error" });
});

test("3001 means no data, which is an answer and not a failure", async () => {
  const diancang = { ...xishan, name: "点苍山", hotPointID: "DIANCANG", typeCode: "260203",
    province: "云南省", city: "大理白族自治州", county: "大理市" };
  const tianditu = client((path, post) => post.queryType === "13"
    ? ok({ 风景名胜: page([], 3001), 山: page([diancang]) })
    : ok({ resultType: 1, pois: [xishan] }));
  const result = await newProvider(tianditu).searchByKeyword("苍山", ["大理白族自治州"]);
  assert.equal(result.status === "success" && result.candidates[0].name, "点苍山");
});

test("a grouped answer that omits a requested category is not accepted", async () => {
  // Measured 2026-10-23: both requested categories always come back, so one missing is a
  // broken answer — and reading the 山 page as empty would lose 点苍山.
  const tianditu = client((path, post) => post.queryType === "13"
    ? ok({ 风景名胜: page([]) })
    : ok({ resultType: 1, pois: [xishan] }));
  const result = await newProvider(tianditu).searchByKeyword("苍山", ["大理白族自治州"]);
  assert.deepEqual(result, { status: "failure", reason: "api_or_response_error" });
});

test("1000 without a pois array is a failure, while an empty array is a real answer", async () => {
  const missingPois = { count: 0, resultType: 1, lineData: [], status: { infocode: 1000 } };
  const brokenGroup = client((path, post) => post.queryType === "13"
    ? ok({ 风景名胜: missingPois, 山: page([]) })
    : ok({ resultType: 1, pois: [xishan] }));
  const broken = await newProvider(brokenGroup).searchByKeyword("苍山", ["大理白族自治州"]);
  assert.equal(broken.status, "failure");

  // A flat answer past the last row: 1000 with pois: [] — an answer that says "nothing here".
  const emptyPage = client((path, post) => post.queryType === "13"
    ? ok({ count: 0, resultType: 1, lineData: [], status: { infocode: 1000 }, pois: [] })
    : ok({ resultType: 1, pois: [xishan] }));
  const empty = await newProvider(emptyPage).searchByKeyword("苍山", ["大理白族自治州"]);
  assert.equal(empty.status, "success");
});

test("a flat answer with no pois array is a failure", async () => {
  const tianditu = client((path, post) => post.queryType === "13"
    ? ok({ count: 0, resultType: 1, lineData: [], status: { infocode: 1000 } })
    : ok({ resultType: 1, pois: [xishan] }));
  const result = await newProvider(tianditu).searchByKeyword("苍山", ["大理白族自治州"]);
  assert.deepEqual(result, { status: "failure", reason: "api_or_response_error" });
});

test("a cached 风景名胜 page that names the words answers without asking for 山", async () => {
  const cached: LocationCandidate = { providerId: "DIANCANG", name: "点苍山", province: "云南省",
    city: "大理白族自治州", district: "大理市", region: "云南省 大理白族自治州 大理市",
    address: null, longitude: 100.1, latitude: 25.7, coordinateSystem: "CGCS2000", kind: "sight" };
  const memory = new ClassificationMemory(null);
  memory.set("大理白族自治州", "风景名胜", [cached]);
  // 山 is not cached, and asking for it would be the wasted call this test forbids.
  const tianditu = client(() => ok({ resultType: 1, pois: [xishan] }));
  const result = await new TiandituLocationProvider(tianditu, memory)
    .searchByKeyword("苍山", ["大理白族自治州"]);
  assert.equal(result.status === "success" && result.candidates[0].name, "点苍山");
  assert.deepEqual(tianditu.calls, ["/v2/search:1"]);
});

test("a whole place inside the trip's area answers without another search", async () => {
  const tianditu = client(() => ok({ resultType: 1, pois: [geopark] }));
  const result = await newProvider(tianditu).searchByKeyword("苍山", ["云南省", "大理白族自治州"]);
  assert.equal(result.status === "success" && result.candidates[0].name, "苍山世界地质公园");
  assert.deepEqual(tianditu.calls, ["/v2/search:1"]);
});

test("a 市 answer keeps the city first and offers the scenic area filed inside it", async () => {
  const scenicArea = { ...xishan, name: "黄山风景区", hotPointID: "HS", typeCode: "180400",
    province: "安徽省", city: "黄山市", county: "黄山区" };
  const tianditu = client((path, post) => {
    if (path === "/geocoder") return ok({ result: { addressComponent: { province: "安徽省", city: "黄山市", county: "屯溪区" } } });
    if (post.queryType === "13") return ok({ resultType: 1, pois: [scenicArea] });
    return ok({ resultType: 3, area: { name: "黄山市", adminCode: 156341000, lonlat: "118.33,29.71" } });
  });
  const result = await newProvider(tianditu).searchByKeyword("黄山");
  assert.deepEqual(result.status === "success" && result.candidates.map((place) => place.name), ["黄山市", "黄山风景区"]);
});

test("a 市 answer takes its province from reverse geocoding; a province answer needs none", async () => {
  const city = client((path, post) => path === "/geocoder"
    ? ok({ result: { addressComponent: { province: "云南省", city: "丽江市", county: "古城区" } } })
    : post.queryType === "13"
      ? ok({ count: 0, resultType: 1, lineData: [], pois: [] })
      : ok({ resultType: 3, area: { name: "丽江市", adminCode: 156530700, lonlat: "100.22,26.85" } }));
  const cityResult = await newProvider(city).searchByKeyword("丽江");
  assert.deepEqual(cityResult.status === "success" &&
    [cityResult.candidates[0].province, cityResult.candidates[0].city], ["云南省", "丽江市"]);
  // The national answer, its reverse geocoding, then one classification request for both
  // categories (the answer is grouped by category), never two.
  assert.deepEqual(city.calls, ["/v2/search:1", "/geocoder:geocode", "/v2/search:13"]);

  const province = client(() => ok({ resultType: 3, area: { name: "云南省", adminCode: 156530000, lonlat: "100.5,25" } }));
  const provinceResult = await newProvider(province).searchByKeyword("云南");
  assert.deepEqual(provinceResult.status === "success" &&
    [provinceResult.candidates[0].name, provinceResult.candidates[0].province], ["云南省", "云南省"]);
  // A province is left alone: one request, no classification search.
  assert.deepEqual(province.calls, ["/v2/search:1"]);
});

test("an area answer whose reverse geocoding fails is a failure, not a place without a province", async () => {
  const tianditu = client((path) => path === "/geocoder"
    ? ok({})
    : ok({ resultType: 3, area: { name: "丽江市", adminCode: 156530700, lonlat: "100.22,26.85" } }));
  const result = await newProvider(tianditu).searchByKeyword("丽江");
  assert.deepEqual(result, { status: "failure", reason: "network_or_response_error" });
});

test("no data is an empty answer; a refusal or a missing key is a failure", async () => {
  const none = await newProvider(client(() => ({ ok: true, body: { status: { infocode: 3001 } } })))
    .searchByKeyword("没有这个地方");
  assert.deepEqual(none, { status: "success", candidates: [] });
  const refused = await newProvider(client(() => ({ ok: false, reason: "refused" })))
    .searchByKeyword("苍山");
  assert.deepEqual(refused, { status: "failure", reason: "network_or_response_error" });
  const blank = await newProvider(client(() => ok({}))).searchByKeyword("  ");
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
