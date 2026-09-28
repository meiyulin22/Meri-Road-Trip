import assert from "node:assert/strict";
import test from "node:test";

import {
  destinationRecommendationSelectionMessageId,
  locationCandidateSelectionMessageId,
} from "./destination-selection-message-id";

const tripId = "3d17d2c7-fd9b-4748-b751-3a76a9a920be";

test("a candidate follow-up keeps the id it has always had", () => {
  // Follow-ups already in the database are found by this id. The literal below is
  // the contract: changing how the id is built would orphan every one of them.
  assert.equal(locationCandidateSelectionMessageId(tripId, "assistant-1", 0),
    "36f469b9-f528-52f4-8052-0974f8abcc29");
});

test("each card gets its own id, and the two kinds of card never collide", () => {
  const candidate = locationCandidateSelectionMessageId(tripId, "assistant-1", 0);
  assert.notEqual(candidate, locationCandidateSelectionMessageId(tripId, "assistant-1", 1));
  assert.notEqual(candidate, locationCandidateSelectionMessageId(tripId, "assistant-2", 0));
  assert.notEqual(candidate, destinationRecommendationSelectionMessageId(tripId, "assistant-1", "0"));

  const recommendation = destinationRecommendationSelectionMessageId(tripId, "assistant-1", "rec-a");
  assert.equal(recommendation, destinationRecommendationSelectionMessageId(tripId, "assistant-1", "rec-a"));
  assert.notEqual(recommendation, destinationRecommendationSelectionMessageId(tripId, "assistant-1", "rec-b"));
});

test("both ids are version 5 UUIDs", () => {
  for (const id of [locationCandidateSelectionMessageId(tripId, "assistant-1", 0),
    destinationRecommendationSelectionMessageId(tripId, "assistant-1", "rec-a")]) {
    assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  }
});
