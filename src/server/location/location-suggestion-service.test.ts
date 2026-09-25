import assert from "node:assert/strict";
import test from "node:test";

import {
  InvalidLocationSuggestionQueryError,
  LocationSuggestionProviderError,
  LocationSuggestionService,
  type LocationSuggestionProvider,
} from "./location-suggestion-service";

test("trims the query and returns provider suggestions without truncation", async () => {
  const queries: string[] = [];
  const provider: LocationSuggestionProvider = {
    async suggest(query) {
      queries.push(query);
      return { status: "success", suggestions: Array.from({ length: 12 }, (_, index) => ({
        provider: "amap" as const, providerId: null, name: `地点${index}`,
        region: null, adcode: null, address: null, coordinates: null,
      })) };
    },
  };
  const suggestions = await new LocationSuggestionService(provider).suggest("  香格  ");
  assert.deepEqual(queries, ["香格"]);
  assert.equal(suggestions.length, 12);
});

test("empty and overlong queries are rejected before provider calls", async () => {
  let calls = 0;
  const provider: LocationSuggestionProvider = {
    async suggest() { calls += 1; return { status: "success", suggestions: [] }; },
  };
  const service = new LocationSuggestionService(provider);
  for (const query of ["", "  ", "x".repeat(81)]) {
    await assert.rejects(service.suggest(query), InvalidLocationSuggestionQueryError);
  }
  assert.deepEqual(await service.suggest("x".repeat(80)), []);
  assert.equal(calls, 1);
});

test("provider failure becomes a fixed service error", async () => {
  const provider: LocationSuggestionProvider = {
    async suggest() { return { status: "failure", reason: "timeout" }; },
  };
  await assert.rejects(new LocationSuggestionService(provider).suggest("香格"),
    (error: unknown) => error instanceof LocationSuggestionProviderError && error.reason === "timeout");
});
