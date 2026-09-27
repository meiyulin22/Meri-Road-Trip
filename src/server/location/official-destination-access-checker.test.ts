import assert from "node:assert/strict";
import test from "node:test";

import type { DestinationCandidate } from "@/domain/location/destination-candidates";
import { BochaOfficialAccessSearch } from "@/infrastructure/location/bocha-official-access-search";
import type { AccessInterpretation, DestinationAccessEvidenceInterpreter } from "@/server/ai/destination-access-evidence-interpreter";
import type { OfficialAccessSearchResult } from "./official-access-search";
import { buildOfficialAccessQuery, OfficialDestinationAccessChecker, officialAuthorityForUrl } from "./official-destination-access-checker";

const candidate: DestinationCandidate = { id: "candidate-1", name: "示例线", region: "示例省", preferenceRationale: "Matches preferences." };
const now = () => new Date("2026-09-27T00:00:00.000Z");
const page = (title: string, snippet: string, url = "https://park.example.gov.cn/notice", publishedAt = "2026-09-20T00:00:00.000Z"): OfficialAccessSearchResult =>
  ({ title, snippet, url, siteName: "示例公园管理局", publishedAt });
const restricted = page("示例线禁止穿越公告", "示例线禁止穿越");
const open = page("示例线恢复开放公告", "示例线现已开放", "https://park.example.gov.cn/open");
const decision = (status: AccessInterpretation["status"], evidenceIds = ["e1"]): AccessInterpretation =>
  ({ status, reason: "Evidence-based interpretation.", evidenceIds });
const check = (pages: readonly OfficialAccessSearchResult[], output: AccessInterpretation) => new OfficialDestinationAccessChecker({
  search: { async search(query) { assert.equal(query, "示例线 示例省 进入 通行 穿越 开放 封闭 禁止 官方公告"); return pages; } },
  interpreter: { async interpret() { return output; } }, now,
}).check(candidate);

test("validated semantic restriction is preserved with cited evidence", async () => {
  const result = await check([restricted], decision("blocked"));
  assert.equal(result.status, "blocked");
  assert.deepEqual(result.evidence?.[0], {
    authority: "park.example.gov.cn", sourceUrl: restricted.url, title: restricted.title,
    publishedAt: restricted.publishedAt, retrievedAt: now().toISOString(), excerpt: restricted.snippet,
  });
  assert.equal((await check([restricted], decision("uncertain"))).status, "uncertain");
});

test("clear non-restricted evidence can remain eligible without a complete safety finding", async () => {
  const result = await check([open], decision("clear"));
  assert.equal(result.status, "clear");
  assert.equal(result.reason, "Evidence-based interpretation.");
});

test("keyword and freshness guards do not override valid interpreter decisions", async () => {
  assert.equal((await check([restricted], decision("clear"))).status, "clear");
  assert.equal((await check([open], decision("blocked"))).status, "blocked");
  assert.equal((await check([restricted, open], decision("uncertain", ["e1", "e2"]))).status, "uncertain");
  assert.equal((await check([page("示例线正常游览", "普通游览", open.url, "2024-01-01T00:00:00.000Z")],
    decision("clear"))).status, "clear");
  assert.equal((await check([], decision("uncertain", []))).status, "uncertain");
});

test("search, interpreter, malformed response, and invented evidence failures stay uncertain without leaked secrets", async () => {
  const failedSearch = new OfficialDestinationAccessChecker({
    search: { async search() { throw new Error("secret API key"); } },
    interpreter: { async interpret() { throw new Error("should not run"); } }, now,
  });
  const failedInterpreter: DestinationAccessEvidenceInterpreter = { async interpret() { throw new Error("secret model key"); } };
  const checker = new OfficialDestinationAccessChecker({ search: { async search() { return [restricted]; } }, interpreter: failedInterpreter, now });
  const malformedSearch = new BochaOfficialAccessSearch({ apiKey: "secret API key", fetcher: async () =>
    new Response(JSON.stringify({ code: 200, messages: [{ type: "source", content_type: "webpage", content: "bad json" }] }), { status: 200 }) });
  const malformedChecker = new OfficialDestinationAccessChecker({ search: malformedSearch, interpreter: failedInterpreter, now });
  for (const result of [await failedSearch.check(candidate), await checker.check(candidate),
    await malformedChecker.check(candidate), await check([restricted], decision("blocked", ["invented"]))]) {
    assert.equal(result.status, "uncertain");
    assert.doesNotMatch(JSON.stringify(result), /secret|invented/);
  }
});

test("source classification resists spoof domains and query has no hardcoded destination", () => {
  assert.equal(officialAuthorityForUrl("https://city.gov.cn/notice"), "city.gov.cn");
  assert.equal(officialAuthorityForUrl("https://city.gov.cn.evil.test/notice"), null);
  assert.equal(officialAuthorityForUrl("http://city.gov.cn/notice"), null);
  assert.equal(officialAuthorityForUrl("https://park.example.org/notice"), null);
  assert.equal(officialAuthorityForUrl("https://park.example.org/notice", ["park.example.org"]), "park.example.org");
  assert.equal(buildOfficialAccessQuery({ ...candidate, name: "另一路线", region: null }),
    "另一路线 进入 通行 穿越 开放 封闭 禁止 官方公告");
});
