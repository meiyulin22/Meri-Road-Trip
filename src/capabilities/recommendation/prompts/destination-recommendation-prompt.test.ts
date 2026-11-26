import assert from "node:assert/strict";
import test from "node:test";

import type { TripState } from "@/domain/trip-state/trip-state";

import { buildDestinationRecommendationSystemPrompt } from "./destination-recommendation-prompt";

const state: TripState = {
  name: { state: "missing" }, origin: { state: "missing" }, destination: { state: "missing" },
  startDate: { state: "missing" }, endDate: { state: "missing" },
  duration: { state: "missing" }, transportPreference: { state: "missing" },
};
const context = { source: "conversation" as const, scope: "within" as const, tripState: state, conversationHistory: [], locale: "zh" as const };

test("the catalog's cities are added as data, without scores, only when there are some (RAG step 4)", () => {
  const without = buildDestinationRecommendationSystemPrompt(context);
  assert.doesNotMatch(without, /Meri's own catalog/u);
  const withCities = buildDestinationRecommendationSystemPrompt({ ...context, catalogCities: [
    { province: "云南省", city: "丽江市", score: 0.9, matches: [{ name: "玉龙雪山", kind: "spot", summary: "雪山。" }] },
  ] });
  assert.ok(withCities.startsWith(without));
  assert.match(withCities, /Meri's own catalog/u);
  assert.match(withCities, /"city":"丽江市","matches":\[\{"name":"玉龙雪山"/u);
  assert.doesNotMatch(withCities, /"score"/u);
});
