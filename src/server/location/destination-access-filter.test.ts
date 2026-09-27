import assert from "node:assert/strict";
import test from "node:test";

import { validateDestinationAccessResult, type DestinationAccessResult } from "@/domain/location/destination-access";
import type { DestinationCandidate } from "@/domain/location/destination-candidates";
import { filterDestinationCandidatesByAccess, type DestinationAccessChecker } from "./destination-access-filter";

const evidence = {
  authority: "Example park authority", sourceUrl: "https://example.test/access", title: "Access notice",
  publishedAt: "2026-09-20T00:00:00.000Z", retrievedAt: "2026-09-27T00:00:00.000Z",
  excerpt: "Access information for the proposed area.",
};
const candidate = (id: string): DestinationCandidate =>
  ({ id, name: `Place ${id}`, region: null, preferenceRationale: "Matches preferences." });

test("only blocked is filtered; clear and uncertain survive in input order with stable IDs", async () => {
  const candidates = [candidate("a"), candidate("b"), candidate("c"), candidate("d")];
  const results: Record<string, DestinationAccessResult> = {
    a: { status: "uncertain", reason: "Evidence missing." },
    b: { status: "blocked", reason: "Official closure.", evidence: [evidence] },
    c: { status: "clear", reason: "Normal access.", evidence: [evidence] },
    d: { status: "uncertain", reason: "Evidence conflicts.", evidence: [evidence] },
  };
  const checker: DestinationAccessChecker = { async check(item) {
    if (item.id === "a") await new Promise((resolve) => setTimeout(resolve, 10));
    return results[item.id];
  } };
  const filtered = await filterDestinationCandidatesByAccess(candidates, checker);
  assert.deepEqual(filtered.eligible.map(({ candidate: item }) => item.id), ["a", "c", "d"]);
  assert.deepEqual(filtered.blocked.map(({ candidate: item }) => item.id), ["b"]);
  assert.deepEqual(filtered.eligible.map(({ access }) => access.status), ["uncertain", "clear", "uncertain"]);
  assert.equal(filtered.eligible[0].candidate, candidates[0]);
  assert.deepEqual(filtered.blocked[0].access.evidence, [evidence]);
});

test("provider or validation failure becomes eligible uncertainty", async () => {
  const candidates = [candidate("failure"), candidate("invalid")];
  const checker: DestinationAccessChecker = { async check(item) {
    if (item.id === "failure") throw new Error("secret-key");
    return { status: "blocked", reason: "Uncited claim.", evidence: [] };
  } };
  const filtered = await filterDestinationCandidatesByAccess(candidates, checker);
  assert.equal(filtered.blocked.length, 0);
  assert.deepEqual(filtered.eligible.map(({ access }) => access.status), ["uncertain", "uncertain"]);
  assert.doesNotMatch(JSON.stringify(filtered), /secret-key/);
});

test("access checks use bounded parallelism and preserve candidate order", async () => {
  const candidates = Array.from({ length: 8 }, (_, index) => candidate(String(index)));
  let active = 0;
  let maximum = 0;
  const filtered = await filterDestinationCandidatesByAccess(candidates, { async check() {
    active += 1;
    maximum = Math.max(maximum, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    return { status: "uncertain", reason: "No decisive evidence." };
  } });
  assert.equal(maximum, 3);
  assert.deepEqual(filtered.eligible.map(({ candidate: item }) => item.id), candidates.map((item) => item.id));
});

test("status schema requires evidence for blocked and clear, while uncertain may have none", () => {
  assert.deepEqual(validateDestinationAccessResult({ status: "uncertain", reason: "Lookup unavailable." }),
    { status: "uncertain", reason: "Lookup unavailable." });
  for (const status of ["clear", "blocked"] as const) {
    assert.throws(() => validateDestinationAccessResult({ status, reason: "Unsupported." }));
    assert.throws(() => validateDestinationAccessResult({ status, reason: "Unsupported.", evidence: [] }));
  }
  assert.throws(() => validateDestinationAccessResult({ status: "uncertain", reason: "No data.", safetyScore: 3 }));
});
