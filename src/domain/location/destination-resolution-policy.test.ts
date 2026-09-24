import assert from "node:assert/strict";
import test from "node:test";

import type { LocationCandidate } from "./location";
import { resolveDestinationCandidates } from "./destination-resolution-policy";

function candidate(name: string, providerId: string, region: string | null = null): LocationCandidate {
  return { providerId, name, region, address: null, longitude: 116.4, latitude: 39.9, coordinateSystem: "GCJ-02" };
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
