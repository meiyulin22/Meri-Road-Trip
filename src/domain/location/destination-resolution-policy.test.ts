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
