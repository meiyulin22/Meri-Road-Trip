import assert from "node:assert/strict";
import test from "node:test";

import type { LocationSuggestionProvider } from "@/server/location/location-suggestion-service";
import { LocationSuggestionService } from "@/server/location/location-suggestion-service";

import { handleLocationSuggestionsGet } from "./route";

function request(query: string): Request {
  return new Request(`https://meri.example/api/locations/suggestions?${query}`);
}

test("GET returns normalized suggestions without exposing the provider query URL", async () => {
  const provider: LocationSuggestionProvider = {
    async suggest(query) {
      assert.equal(query, "香格 & 山?");
      return { status: "success", suggestions: [{
        provider: "amap", providerId: null, name: "香格里拉",
        region: null, adcode: null, address: null, coordinates: null,
      }] };
    },
  };
  const response = await handleLocationSuggestionsGet(
    request("q=%20%E9%A6%99%E6%A0%BC%20%26%20%E5%B1%B1%3F%20"),
    new LocationSuggestionService(provider),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { suggestions: [{
    provider: "amap", providerId: null, name: "香格里拉",
    region: null, adcode: null, address: null, coordinates: null,
  }] });
});

test("GET rejects absent, blank, and overlong queries", async () => {
  let calls = 0;
  const provider: LocationSuggestionProvider = {
    async suggest() { calls += 1; return { status: "success", suggestions: [] }; },
  };
  const service = new LocationSuggestionService(provider);
  for (const query of ["", "q=%20%20", `q=${"x".repeat(81)}`]) {
    const response = await handleLocationSuggestionsGet(request(query), service);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, "invalid_query");
  }
  assert.equal(calls, 0);
});

test("GET maps provider failures and never exposes secrets", async () => {
  for (const [reason, status] of [
    ["missing_configuration", 503], ["timeout", 504],
    ["upstream_error", 502], ["malformed_response", 502],
  ] as const) {
    const provider: LocationSuggestionProvider = {
      async suggest() { return { status: "failure", reason }; },
    };
    const response = await handleLocationSuggestionsGet(request("q=%E9%A6%99%E6%A0%BC"),
      new LocationSuggestionService(provider));
    assert.equal(response.status, status);
    const body = await response.text();
    assert.equal(body.includes("AMAP_API_KEY"), false);
    assert.equal(body.includes("restapi.amap.com"), false);
  }
});
