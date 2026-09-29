import assert from "node:assert/strict";
import test from "node:test";

import type { LocationCandidate } from "@/domain/location/location";
import { applyTripStatePatch, type TripState } from "@/domain/trip-state/trip-state";
import { LocationService } from "./location-service";
import { persistWorkspacePatchWithDisambiguation } from "./post-update-destination-resolution";
import { narrowingPresentation, replyForDestinationDisambiguation, verifyDestinationDisambiguation } from "./verify-destination-disambiguation";

const candidate: LocationCandidate = {
  providerId: "chaozhou", name: "潮州市", province: "广东省", city: "潮州市", district: null,
  region: "广东省", address: null,
  longitude: 116.62, latitude: 23.66, coordinateSystem: "GCJ-02",
};
const shantou: LocationCandidate = {
  ...candidate, providerId: "shantou", name: "汕头市", city: "汕头市",
  longitude: 116.71, latitude: 23.35,
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
  assert.deepEqual(result.disambiguationResult,
    { status: "verified", places: [{ id: "chaozhou", name: "潮州市", province: "广东省" }] });
  assert.match(replyForDestinationDisambiguation("潮汕", result.disambiguationResult!, true), /下面这个市/);
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

test("the same 市 reached twice is offered once, and each expression contributes one", async () => {
  const service = new LocationService({ async searchByKeyword(query) {
    return { status: "success", candidates: query === "潮州" ? [candidate] : [shantou, shantou] };
  } });
  const result = await verifyDestinationDisambiguation(proposal, service);
  assert.equal(result.status, "verified");
  if (result.status === "verified") {
    assert.deepEqual(result.places, [
      { id: "chaozhou", name: "潮州市", province: "广东省" },
      { id: "shantou", name: "汕头市", province: "广东省" },
    ]);
  }
  // Two expressions inside one 市 — 潮州古城 and 韩文公祠 are both 潮州市 — are one card.
  const sameCity = new LocationService({ async searchByKeyword() {
    return { status: "success", candidates: [candidate] };
  } });
  const single = await verifyDestinationDisambiguation(proposal, sameCity);
  assert.equal(single.status, "verified");
  if (single.status === "verified") assert.equal(single.places.length, 1);
});

test("a 景点 the provider matched is offered as the 市 it sits in", async () => {
  // 「我想去潮汕」 used to end with 潮州古城 on the card and then saved as the
  // destination, which is a 景点 — Generate plan's question, not this one. Whatever
  // the provider matched, the card names the 市 it belongs to.
  const oldTown: LocationCandidate = {
    ...candidate, providerId: "chaozhou-ancient-city", name: "潮州古城",
    district: "湘桥区", region: "广东省潮州市湘桥区", address: "湘桥区太平路",
  };
  const service = new LocationService({ async searchByKeyword() {
    return { status: "success", candidates: [oldTown] };
  } });
  const result = await verifyDestinationDisambiguation({ state: "known", value: ["潮州古城", "汕头老城"] }, service);
  assert.equal(result.status, "verified");
  if (result.status === "verified") {
    assert.deepEqual(result.places, [{ id: "chaozhou-ancient-city", name: "潮州市", province: "广东省" }]);
    assert.ok(!result.places.some((place) => place.name.includes("古城")));
  }
});

test("a 直辖市 is filed as a province with nothing under it and still answers for itself", async () => {
  const chongqing: LocationCandidate = {
    providerId: "chongqing", name: "重庆市", province: "重庆市", city: null, district: null,
    region: "重庆市", address: null, longitude: 106.55, latitude: 29.56, coordinateSystem: "GCJ-02",
  };
  const guangdong: LocationCandidate = { ...chongqing, providerId: "guangdong", name: "广东省",
    province: "广东省", region: "广东省" };
  const service = new LocationService({ async searchByKeyword(query) {
    return { status: "success", candidates: query === "重庆" ? [chongqing] : [guangdong] };
  } });
  const result = await verifyDestinationDisambiguation({ state: "known", value: ["重庆", "广东"] }, service);
  assert.equal(result.status, "verified");
  // A province is not a 市, so it contributes nothing to pick from.
  if (result.status === "verified") {
    assert.deepEqual(result.places, [{ id: "chongqing", name: "重庆市", province: "重庆市" }]);
  }
});

test("the narrowed 市 are offered as destination cards, picked several at once and without a reason", () => {
  const presentation = narrowingPresentation({ status: "verified", places: [
    { id: "chaozhou", name: "潮州市", province: "广东省" },
    { id: "shantou", name: "汕头市", province: "广东省" },
  ] });
  assert.deepEqual(presentation, { type: "destination_recommendations", destinations: [
    { id: "chaozhou", name: "潮州市", province: "广东省" },
    { id: "shantou", name: "汕头市", province: "广东省" },
  ] });
  // A reason here would have to be invented; the province heading and the 市 name
  // are the whole answer to 「潮汕 是哪几个市」.
  assert.ok(presentation.destinations.every((destination) => destination.reason === undefined));
});
