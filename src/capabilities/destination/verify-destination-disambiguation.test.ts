import assert from "node:assert/strict";
import test from "node:test";

import type { LocationCandidate } from "@/domain/location/location";
import { applyTripStatePatch, type TripState } from "@/domain/trip-state/trip-state";
import { LocationService } from "./location-service";
import { persistWorkspacePatchWithDisambiguation } from "./post-update-destination-resolution";
import { replyForDestinationDisambiguation, verifyDestinationDisambiguation } from "./verify-destination-disambiguation";

const candidate: LocationCandidate = {
  providerId: "chaozhou", name: "潮州市", region: "广东省", address: null,
  longitude: 116.62, latitude: 23.66, coordinateSystem: "GCJ-02",
};
const state: TripState = {
  name: { state: "known", value: "旧旅行", source: "user" },
  origin: { state: "missing" }, destination: { state: "known", value: "青岛", source: "user" },
  startDate: { state: "missing" }, endDate: { state: "missing" },
  duration: { state: "missing" }, transportPreference: { state: "missing" },
};
const patch = {
  destination: { state: "known" as const, value: "潮汕", source: "user" as const },
  duration: { state: "known" as const, value: "5天", source: "user" as const },
};
const proposal = { state: "known" as const, value: ["潮州", "汕头"] };

test("a direct destination keeps the existing raw resolution path", async () => {
  const queries: string[] = [];
  const service = new LocationService({ async searchByKeyword(query) {
    queries.push(query);
    return { status: "success", candidates: [{ ...candidate, name: "大理", providerId: "dali" }] };
  } });
  const result = await persistWorkspacePatchWithDisambiguation(state,
    { destination: { state: "known", value: "大理", source: "user" } }, null,
    async (committed) => applyTripStatePatch(state, committed), service);
  assert.deepEqual(queries, ["大理"]);
  assert.equal(result.resolution?.status, "resolved");
  assert.equal(result.disambiguationResult, null);
});

test("fuzzy update skips raw expression, filters unverified proposals, and saves other fields", async () => {
  const queries: string[] = [];
  const service = new LocationService({ async searchByKeyword(query) {
    queries.push(query);
    return { status: "success", candidates: query === "潮州" ? [candidate] : [] };
  } });
  const writes: unknown[] = [];
  const result = await persistWorkspacePatchWithDisambiguation(state, patch, proposal,
    async (committed) => { writes.push(committed); return applyTripStatePatch(state, committed); }, service);
  assert.deepEqual(queries.sort(), ["汕头", "潮州"].sort());
  assert.deepEqual(writes, [{ duration: patch.duration }]);
  assert.deepEqual(result.tripState.destination, state.destination);
  assert.deepEqual(result.disambiguationResult, { status: "verified", candidates: [candidate] });
  assert.match(replyForDestinationDisambiguation("潮汕", result.disambiguationResult!, true), /一个更具体的地点/);
});

test("zero verified candidates and provider failure never persist a fuzzy destination", async () => {
  for (const failure of [false, true]) {
    const service = new LocationService({ async searchByKeyword() {
      return failure ? { status: "failure" as const, reason: "http_error" as const } :
        { status: "success" as const, candidates: [] };
    } });
    const result = await persistWorkspacePatchWithDisambiguation(state,
      { destination: patch.destination }, proposal,
      async () => { throw new Error("must not persist"); }, service);
    assert.deepEqual(result.tripState, state);
    assert.equal(result.disambiguationResult?.status, failure ? "provider_error" : "unresolved");
  }
});

test("multiple verified candidates are capped and deduplicated", async () => {
  const second = { ...candidate, providerId: "shantou", name: "汕头市" };
  const service = new LocationService({ async searchByKeyword(query) {
    return { status: "success", candidates: query === "潮州" ? [candidate] : [second, second] };
  } });
  const result = await verifyDestinationDisambiguation(proposal, service);
  assert.equal(result.status, "verified");
  if (result.status === "verified") assert.deepEqual(result.candidates, [candidate, second]);
});
