import assert from "node:assert/strict";
import test from "node:test";

import { validateDestinationAccessResult, type DestinationAccessResult } from "@/domain/location/destination-access";
import type { DestinationCandidate } from "@/domain/location/destination-candidates";
import { filterDestinationCandidatesByAccess, type DestinationAccessChecker } from "./destination-access-filter";

const evidence = {
  authority: "Example park authority",
  sourceUrl: "https://example.test/notices/access",
  title: "Access notice",
  publishedAt: "2026-09-20T00:00:00.000Z",
  effectiveAt: "2026-09-21T00:00:00.000Z",
  retrievedAt: "2026-09-27T00:00:00.000Z",
  excerpt: "Official access information for the proposed area.",
};

function candidate(id: string, name: string): DestinationCandidate {
  return { id, name, region: null, preferenceRationale: "May fit the Journey preferences." };
}

test("allows supported access, removes restricted and unknown, and preserves evidence and IDs", async () => {
  const candidates = [candidate("id-1", "Place Alpha"), candidate("id-2", "Route Beta"), candidate("id-3", "Area Gamma")];
  const results: Record<string, DestinationAccessResult> = {
    "id-1": { status: "allowed", reason: "Official notice permits access.", evidence: [evidence] },
    "id-2": { status: "restricted", reason: "Official notice closes the route.", evidence: [evidence] },
    "id-3": { status: "unknown", reason: "Available notices conflict.", evidence: [evidence] },
  };
  const checker: DestinationAccessChecker = { async check(item) { return results[item.id]; } };
  const filtered = await filterDestinationCandidatesByAccess(candidates, checker);

  assert.deepEqual(filtered.allowed, [{ candidate: candidates[0], access: results["id-1"] }]);
  assert.deepEqual(filtered.restricted, [{ candidate: candidates[1], access: results["id-2"] }]);
  assert.deepEqual(filtered.unknown, [{ candidate: candidates[2], access: results["id-3"] }]);
  assert.equal(filtered.unknown[0].access.status, "unknown");
  assert.equal(filtered.restricted[0].access.status, "restricted");
  assert.deepEqual(candidates.map((item) => item.id), ["id-1", "id-2", "id-3"]);
});

test("checks multiple candidates independently and preserves input order within each status", async () => {
  const candidates = [
    candidate("a", "First"), candidate("b", "Second"), candidate("c", "Third"),
    candidate("d", "Fourth"), candidate("e", "Fifth"),
  ];
  const checkedIds: string[] = [];
  const checker: DestinationAccessChecker = {
    async check(item) {
      checkedIds.push(item.id);
      if (item.id === "a") await new Promise((resolve) => setTimeout(resolve, 10));
      if (item.id === "b" || item.id === "e") return { status: "restricted", reason: "Official closure.", evidence: [evidence] };
      if (item.id === "d") return { status: "unknown", reason: "No current evidence." };
      return { status: "allowed", reason: "Official access notice.", evidence: [evidence] };
    },
  };
  const filtered = await filterDestinationCandidatesByAccess(candidates, checker);
  assert.deepEqual(checkedIds, ["a", "b", "c", "d", "e"]);
  assert.deepEqual(filtered.allowed.map(({ candidate: item }) => item.id), ["a", "c"]);
  assert.deepEqual(filtered.restricted.map(({ candidate: item }) => item.id), ["b", "e"]);
  assert.deepEqual(filtered.unknown.map(({ candidate: item }) => item.id), ["d"]);
  assert.equal(filtered.allowed[0].candidate, candidates[0]);
});

test("provider failure and invalid provider output become unknown without leaking errors", async () => {
  const candidates = [candidate("failure", "Arbitrary route"), candidate("invalid", "Arbitrary place")];
  const checker: DestinationAccessChecker = {
    async check(item) {
      if (item.id === "failure") throw new Error("provider failed with secret-key");
      return { status: "allowed", reason: "Uncited claim.", evidence: [] };
    },
  };
  const filtered = await filterDestinationCandidatesByAccess(candidates, checker);
  assert.equal(filtered.allowed.length, 0);
  assert.equal(filtered.restricted.length, 0);
  assert.deepEqual(filtered.unknown.map(({ candidate: item }) => item.id), ["failure", "invalid"]);
  assert.deepEqual(filtered.unknown.map(({ access }) => access.reason), ["Access lookup failed.", "Access lookup failed."]);
  assert.doesNotMatch(JSON.stringify(filtered), /secret-key/);
});

test("access schema requires evidence for decisions and permits evidence-free unknown", () => {
  assert.deepEqual(validateDestinationAccessResult({ status: "unknown", reason: "Lookup unavailable." }),
    { status: "unknown", reason: "Lookup unavailable." });
  for (const status of ["allowed", "restricted"] as const) {
    assert.throws(() => validateDestinationAccessResult({ status, reason: "Unsupported." }));
    assert.throws(() => validateDestinationAccessResult({ status, reason: "Unsupported.", evidence: [] }));
  }
  assert.throws(() => validateDestinationAccessResult({
    status: "allowed", reason: "Unsupported.", evidence: [{ ...evidence, sourceUrl: "not-a-url" }],
  }));
  assert.throws(() => validateDestinationAccessResult({
    status: "unknown", reason: "Lookup unavailable.", safetyScore: 3,
  }));
});
