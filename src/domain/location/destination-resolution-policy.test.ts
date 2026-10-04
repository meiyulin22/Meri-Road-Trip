import assert from "node:assert/strict";
import test from "node:test";

import type { LocationCandidate } from "./location";
import { resolveDestinationCandidates } from "./destination-resolution-policy";

function candidate(name: string, providerId: string, region: string | null = null): LocationCandidate {
  return { providerId, name, province: null, city: null, district: null, region, address: null,
    longitude: 116.4, latitude: 39.9, coordinateSystem: "GCJ-02" };
}

test("clear city resolves by name even when unrelated POIs precede it", () => {
  const city = candidate("东京都", "tokyo-city", "日本");
  assert.deepEqual(resolveDestinationCandidates("东京", [candidate("东京塔", "tower"), city]), {
    status: "resolved", candidate: city,
  });
});

test("clear district resolves without requiring a city destination", () => {
  const district = candidate("朝阳区", "district", "北京市");
  assert.deepEqual(resolveDestinationCandidates("北京市朝阳区", [district]), {
    status: "resolved", candidate: district,
  });
});

test("clear scenic and outdoor destinations resolve by their own names", () => {
  for (const name of ["长白山", "西湖风景名胜区", "阿尔山国家森林公园", "虎跳峡徒步路线"]) {
    const place = candidate(name, name);
    assert.deepEqual(resolveDestinationCandidates(name, [place]), {
      status: "resolved", candidate: place,
    });
  }
});

test("multiple reasonable matches stay ambiguous regardless of provider order", () => {
  const city = candidate("朝阳市", "city", "辽宁省");
  const district = candidate("朝阳区", "district", "北京市");
  assert.deepEqual(resolveDestinationCandidates("朝阳", [district, city]), {
    status: "ambiguous", candidates: [district, city],
  });
});

test("duplicate provider identity does not create false ambiguity", () => {
  const city = candidate("东京都", "tokyo-city");
  assert.deepEqual(resolveDestinationCandidates("东京", [city, city]), {
    status: "resolved", candidate: city,
  });
});

test("zero valid matching candidates is unresolved, even if search returned unrelated POIs", () => {
  assert.deepEqual(resolveDestinationCandidates("开心市", [candidate("开心购物中心", "mall")]), {
    status: "unresolved",
  });
  assert.deepEqual(resolveDestinationCandidates("开心市", []), { status: "unresolved" });
});

test("a fuller official name is the same place, so scenic destinations resolve", () => {
  for (const [expression, name] of [
    ["稻城亚丁", "稻城亚丁风景区"],
    ["四姑娘山", "四姑娘山风景名胜区"],
    ["贡嘎山", "贡嘎山国家级自然保护区"],
    ["西湖", "西湖风景名胜区"],
    ["普达措", "普达措国家公园"],
  ] as const) {
    const place = candidate(name, name);
    assert.deepEqual(resolveDestinationCandidates(expression, [place]), {
      status: "resolved", candidate: place,
    });
  }
});

test("a way to reach a place is not the place, so transport never resolves it", () => {
  // 稻城亚丁机场 is 200km from the valley; a plan on its coordinates is the wrong plan.
  for (const name of ["稻城亚丁机场", "稻城亚丁火车站", "稻城亚丁游客中心", "稻城亚丁酒店"]) {
    assert.deepEqual(resolveDestinationCandidates("稻城亚丁", [candidate(name, name)]), {
      status: "unresolved",
    });
  }
});

test("a province is an area, not a failure, because the region is what the user gave", () => {
  // Dropping it answered 「我想去海南」 with "I could not verify that地点", which threw
  // away the only thing the user had said.
  for (const [expression, name] of [
    ["云南", "云南省"],
    ["西藏", "西藏自治区"],
    ["海南省", "海南省"],
    ["广西", "广西壮族自治区"],
  ] as const) {
    assert.deepEqual(resolveDestinationCandidates(expression, [candidate(name, name)]), {
      status: "area", province: name,
    });
  }
});

test("the province label names the area, and a point-shaped destination still wins", () => {
  const yunnan = { ...candidate("云南省", "yunnan"), province: "云南省" };
  assert.deepEqual(resolveDestinationCandidates("云南", [candidate("云南大学", "university"), yunnan]),
    { status: "area", province: "云南省" });

  // 北京市 is province-level, yet a plan can run on a municipality, so it resolves.
  const beijing = { ...candidate("北京市", "beijing", "北京市 东城区"), province: "北京市", city: "北京市" };
  assert.deepEqual(resolveDestinationCandidates("北京", [beijing]), { status: "resolved", candidate: beijing });

  // A province that happens to be in the results is not what was asked for.
  assert.deepEqual(resolveDestinationCandidates("丽江", [yunnan]), { status: "unresolved" });
  assert.deepEqual(resolveDestinationCandidates("云", [yunnan]), { status: "unresolved" });
});

test("a scenic area and its city are genuinely different places, so they stay a choice", () => {
  const scenic = candidate("黄山风景区", "scenic", "安徽省");
  const city = candidate("黄山市", "city", "安徽省");
  assert.deepEqual(resolveDestinationCandidates("黄山", [scenic, city]), {
    status: "ambiguous", candidates: [scenic, city],
  });
});

function located(name: string, providerId: string, city: string, district: string | null = null): LocationCandidate {
  return { ...candidate(name, providerId), province: "某省", city, district };
}

test("a sight filed under its own 市 or 州 is still the sight the user named", () => {
  // Amap's names, checked 2026-10-04: the prefix is only where the sight is.
  const westLake = located("杭州西湖风景名胜区", "west-lake", "杭州市", "西湖区");
  assert.deepEqual(resolveDestinationCandidates("西湖", [westLake]), { status: "resolved", candidate: westLake });
  const daocheng = located("甘孜稻城亚丁景区", "daocheng", "甘孜藏族自治州", "稻城县");
  assert.deepEqual(resolveDestinationCandidates("稻城亚丁", [daocheng]), { status: "resolved", candidate: daocheng });
  // A prefix that is not its own place is not stripped: 成都 is not where this one is.
  assert.deepEqual(resolveDestinationCandidates("西湖", [located("成都西湖酒店", "hotel", "杭州市")]), { status: "unresolved" });
});

test("beside a sight of the same name in the same 市, a district gives way, but never a 市 or another place", () => {
  const westLake = located("杭州西湖风景名胜区", "west-lake", "杭州市", "西湖区");
  const district = located("西湖区", "west-lake-district", "杭州市", "西湖区");
  assert.deepEqual(resolveDestinationCandidates("西湖", [district, westLake]), { status: "resolved", candidate: westLake });

  const mountain = located("黄山风景区", "huangshan", "黄山市", "黄山区");
  const city = located("黄山市", "huangshan-city", "黄山市", "屯溪区");
  const huangshanDistrict = located("黄山区", "huangshan-district", "黄山市", "黄山区");
  assert.deepEqual(resolveDestinationCandidates("黄山", [mountain, city, huangshanDistrict]),
    { status: "ambiguous", candidates: [mountain, city] });

  // Only administrative names: 朝阳 stays the user's choice.
  const chaoyangCity = located("朝阳市", "chaoyang-city", "朝阳市", "双塔区");
  const chaoyangCounty = located("朝阳县", "chaoyang-county", "朝阳市", "朝阳县");
  assert.deepEqual(resolveDestinationCandidates("朝阳", [chaoyangCity, chaoyangCounty]),
    { status: "ambiguous", candidates: [chaoyangCity, chaoyangCounty] });
});

test("only when nothing else matches, a name with some other prefix is found, from three characters", () => {
  const monastery = located("噶丹松赞林寺", "songzanlin", "迪庆藏族自治州", "香格里拉市");
  const parking = located("噶丹松赞林寺停车场", "parking", "迪庆藏族自治州", "香格里拉市");
  assert.deepEqual(resolveDestinationCandidates("松赞林寺", [monastery, parking]), { status: "resolved", candidate: monastery });
  // A stricter match wins outright, so a loose one never turns it into a choice…
  const park = located("人民公园", "park", "成都市");
  assert.deepEqual(resolveDestinationCandidates("人民公园", [park, located("南湖人民公园", "other", "内江市")]),
    { status: "resolved", candidate: park });
  // …while one filed under its own 市 is a second 人民公园, and that is a real choice.
  const neijiang = located("内江人民公园", "neijiang", "内江市");
  assert.deepEqual(resolveDestinationCandidates("人民公园", [park, neijiang]), { status: "ambiguous", candidates: [park, neijiang] });
  // Two characters end far too many names: 西湖 must not find 瘦西湖.
  assert.deepEqual(resolveDestinationCandidates("西湖", [located("瘦西湖", "slender", "扬州市")]), { status: "unresolved" });
});

test("as a last resort, sights whose name holds the user's words are offered, never what serves them", () => {
  const sight = (name: string, id: string) => ({ ...located(name, id, "北京市", "东城区"), kind: "sight" as const });
  const palace = sight("故宫博物院", "palace");
  const gate = sight("故宫博物院-午门", "gate");
  const tickets = { ...located("故宫博物院检票处", "tickets", "北京市"), kind: "other" as const };
  const building = sight("北京故宫博物院北院区(建设中)", "building");
  assert.deepEqual(resolveDestinationCandidates("故宫", [palace, gate, tickets, building]), { status: "resolved", candidate: palace });

  // 秦始皇帝陵博物院 is the right site but does not say 兵马俑, so only the museum that does is offered.
  const mausoleum = sight("秦始皇帝陵博物院", "mausoleum");
  const museum = sight("秦始皇兵马俑博物馆", "museum");
  assert.deepEqual(resolveDestinationCandidates("兵马俑", [mausoleum, museum]), { status: "resolved", candidate: museum });

  const walls = ["八达岭长城", "居庸关长城", "慕田峪长城", "彰作里关长城"].map((name) => sight(name, name));
  assert.deepEqual(resolveDestinationCandidates("长城", walls), { status: "ambiguous", candidates: walls.slice(0, 3) });

  // A place the provider did not call a sight is not offered.
  assert.deepEqual(resolveDestinationCandidates("故宫", [located("故宫博物院", "unknown-kind", "北京市")]), { status: "unresolved" });
});
