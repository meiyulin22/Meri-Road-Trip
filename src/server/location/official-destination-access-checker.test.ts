import assert from "node:assert/strict";
import test from "node:test";

import type { DestinationCandidate } from "@/domain/location/destination-candidates";
import type { OfficialAccessSearchResult } from "./official-access-search";
import { BochaOfficialAccessSearch } from "@/infrastructure/location/bocha-official-access-search";
import { buildOfficialAccessQuery, OfficialDestinationAccessChecker, officialAuthorityForUrl } from "./official-destination-access-checker";

const candidate: DestinationCandidate = { id: "candidate-1", name: "示例线", region: "示例省", preferenceRationale: "Matches preferences." };
const now = () => new Date("2026-09-27T00:00:00.000Z");
const page = (title: string, snippet: string, url = "https://park.example.gov.cn/notice", publishedAt = "2026-09-20T00:00:00.000Z"): OfficialAccessSearchResult =>
  ({ title, snippet, url, siteName: "示例公园管理局", publishedAt });
const restricted = page("示例线禁止穿越公告", "示例线禁止穿越");
const allowed = page("示例线恢复开放公告", "示例线现已开放", "https://park.example.gov.cn/open");
const check = (pages: readonly OfficialAccessSearchResult[]) => new OfficialDestinationAccessChecker({
  search: { async search(query) { assert.equal(query, "示例线 示例省 进入 通行 穿越 开放 封闭 禁止 官方公告"); return pages; } }, now,
}).check(candidate);

test("official restriction and explicit official opening produce evidence-backed decisions", async () => {
  const closed = await check([restricted]);
  assert.equal(closed.status, "restricted");
  assert.deepEqual(closed.evidence?.[0], {
    authority: "park.example.gov.cn", sourceUrl: restricted.url, title: restricted.title,
    publishedAt: restricted.publishedAt, retrievedAt: now().toISOString(), excerpt: restricted.snippet,
  });
  assert.equal((await check([allowed])).status, "allowed");
});

test("nonofficial, conflicting, stale, missing, and identity-mismatched evidence stay unknown", async () => {
  const cases = [
    [page("示例线禁止穿越", "禁止穿越", "https://travel.example.com/article")],
    [restricted, allowed],
    [page("示例线禁止穿越", "禁止穿越", restricted.url, "2024-01-01T00:00:00.000Z")],
    [],
    [page("另一路线禁止穿越", "另一路线禁止穿越")],
  ];
  for (const pages of cases) assert.equal((await check(pages)).status, "unknown");
  const conflict = await check([restricted, allowed]);
  assert.equal(conflict.status, "unknown");
  assert.equal(conflict.evidence?.length, 2);
});

test("search failure becomes unknown and never exposes provider errors", async () => {
  const checker = new OfficialDestinationAccessChecker({
    search: { async search() { throw new Error("secret API key"); } }, now,
  });
  const result = await checker.check(candidate);
  assert.equal(result.status, "unknown");
  assert.doesNotMatch(JSON.stringify(result), /secret/);
});

test("malformed HTTP payload becomes unknown through the concrete adapter", async () => {
  const search = new BochaOfficialAccessSearch({ apiKey: "secret API key", fetcher: async () =>
    new Response(JSON.stringify({ code: 200, messages: [{ type: "source", content_type: "webpage", content: "bad json" }] }), { status: 200 }) });
  const result = await new OfficialDestinationAccessChecker({ search, now }).check(candidate);
  assert.equal(result.status, "unknown");
  assert.doesNotMatch(JSON.stringify(result), /secret/);
});

test("government host matching resists spoof domains; institutional hosts require exact verification", () => {
  assert.equal(officialAuthorityForUrl("https://city.gov.cn/notice"), "city.gov.cn");
  assert.equal(officialAuthorityForUrl("https://city.gov.cn.evil.test/notice"), null);
  assert.equal(officialAuthorityForUrl("http://city.gov.cn/notice"), null);
  assert.equal(officialAuthorityForUrl("https://park.example.org/notice"), null);
  assert.equal(officialAuthorityForUrl("https://park.example.org/notice", ["park.example.org"]), "park.example.org");
  assert.equal(buildOfficialAccessQuery({ ...candidate, name: "另一路线", region: null }),
    "另一路线 进入 通行 穿越 开放 封闭 禁止 官方公告");
});
