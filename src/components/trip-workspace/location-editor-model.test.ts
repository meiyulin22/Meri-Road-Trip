import assert from "node:assert/strict";
import test from "node:test";

import { validateTripStatePatch } from "@/domain/trip-state/trip-state";

import { createSelectedLocationPatch, normalizeSuggestionQuery, parseSuggestionResponse } from "./location-editor-model";

test("trims search and requires two to eighty characters", () => {
  assert.equal(normalizeSuggestionQuery("  香格  "), "香格");
  assert.equal(normalizeSuggestionQuery(" 香 "), null);
  assert.equal(normalizeSuggestionQuery("x".repeat(81)), null);
});

test("parses a complete suggestion response without truncating the list", () => {
  const suggestion = {
    provider: "amap", providerId: "tip-1", name: "香格里拉站",
    region: "云南省迪庆藏族自治州", adcode: "533401", address: "环湖公路18号",
    coordinates: { longitude: 99.7, latitude: 27.8, coordinateSystem: "GCJ-02" },
  };
  const result = parseSuggestionResponse({ suggestions: Array.from({ length: 8 }, () => suggestion) });
  assert.equal(result.length, 8);
  assert.throws(() => parseSuggestionResponse({ suggestions: [{ name: "missing fields" }] }));
});

test("selection maps only supported metadata to the exact destination PATCH", () => {
  const suggestion = {
    provider: "amap", providerId: "tip-1", name: "香格里拉站",
    region: "云南省迪庆藏族自治州", adcode: "533401", address: "环湖公路18号",
    coordinates: { longitude: 99.7, latitude: 27.8, coordinateSystem: "GCJ-02" },
  } as const;
  const patch = createSelectedLocationPatch("destination", suggestion);
  assert.deepEqual(validateTripStatePatch(patch), patch);
  assert.deepEqual(patch, {
    destination: {
      state: "known", value: "香格里拉站", source: "user",
      selection: {
        provider: "amap", providerId: "tip-1", region: "云南省迪庆藏族自治州",
        address: "环湖公路18号", coordinates: suggestion.coordinates,
      },
    },
  });
});

test("nullable suggestion details are omitted from selection", () => {
  const patch = createSelectedLocationPatch("destination", {
    provider: "amap", providerId: null, name: "香格里拉",
    region: "云南省", adcode: null, address: null, coordinates: null,
  });
  assert.deepEqual(patch.destination, {
    state: "known", value: "香格里拉", source: "user",
    selection: { provider: "amap", region: "云南省" },
  });
});

test("the shared model PATCHes origin while preserving the same selected identity", () => {
  const suggestion = {
    provider: "amap", providerId: "tip-dalian", name: "大连站",
    region: "辽宁省大连市中山区", adcode: "210202", address: "长江路259号",
    coordinates: { longitude: 121.63, latitude: 38.92, coordinateSystem: "GCJ-02" },
  } as const;
  const patch = createSelectedLocationPatch("origin", suggestion);
  assert.deepEqual(validateTripStatePatch(patch), patch);
  assert.deepEqual(patch, {
    origin: {
      state: "known", value: "大连站", source: "user",
      selection: {
        provider: "amap", providerId: "tip-dalian", region: "辽宁省大连市中山区",
        address: "长江路259号", coordinates: suggestion.coordinates,
      },
    },
  });
  assert.equal("destination" in patch, false);
});
