import assert from "node:assert/strict";
import test from "node:test";

import { cityPointOf, createTiandituCityPoint, isAdminNameOf } from "./tianditu-city-point";

// The shape of Tianditu's administrative answer (docs/TIANDITU_FIELDS.md §3.2).
const areaAnswer = (name: string, adminCode: number, lonlat: string) =>
  ({ resultType: 3, status: { infocode: 1000, cndesc: "服务正常" }, area: { name, adminCode, lonlat, level: 11 } });

test("a city's centre is read only from an administrative answer with the name asked for (1.2106)", () => {
  assert.deepEqual(cityPointOf(areaAnswer("丽江市", 156530700, "100.22775,26.85565"), "丽江市"),
    { status: "found", city: { name: "丽江市", adminCode: "156530700", point: { longitude: 100.22775, latitude: 26.85565 } } });
  // A short name of the area is enough: 上海 → 上海市, 大理 → 大理白族自治州.
  assert.equal(cityPointOf(areaAnswer("上海市", 156310000, "121.47,31.23"), "上海").status, "found");
  assert.equal(cityPointOf(areaAnswer("大理白族自治州", 156532900, "100.26,25.61"), "大理").status, "found");
  // Another area, a list of POIs, nothing found or a broken point: not found, never a guess.
  assert.equal(cityPointOf(areaAnswer("丽江市", 156530700, "100.2,26.8"), "大理").status, "not_found");
  assert.equal(cityPointOf({ resultType: 1, status: { infocode: 1000 }, pois: [{ name: "伦敦大厦" }] }, "伦敦").status, "not_found");
  assert.equal(cityPointOf({ status: { infocode: 3001 } }, "伦敦").status, "not_found");
  assert.equal(cityPointOf(areaAnswer("丽江市", 156530700, "east"), "丽江市").status, "not_found");
  assert.deepEqual(cityPointOf({ status: { infocode: 4001 } }, "丽江市"), { status: "failure", reason: "api_error" });
});

test("only an administrative ending may follow the words", () => {
  assert.ok(isAdminNameOf("新疆", "新疆维吾尔自治区"));
  assert.ok(isAdminNameOf("德宏", "德宏傣族景颇族自治州"));
  assert.ok(!isAdminNameOf("丽", "丽江市"));
  assert.ok(!isAdminNameOf("大理", "大理石厂"));
});

test("one search, no retry: a refusal is a failure the caller stops on", async () => {
  const asked: string[] = [];
  const cityPoint = createTiandituCityPoint({
    get: async (path, params) => { asked.push(`${path} ${params.postStr}`); return { ok: false, reason: "refused" }; },
    getXml: async () => ({ ok: false, reason: "refused" }),
  });
  assert.deepEqual(await cityPoint("丽江市"), { status: "failure", reason: "refused" });
  assert.equal(asked.length, 1);
  assert.match(asked[0], /"keyWord":"丽江市"/u);
  assert.deepEqual(await cityPoint("  "), { status: "not_found" });
  assert.equal(asked.length, 1);
});
