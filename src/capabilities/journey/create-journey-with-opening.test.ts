import assert from "node:assert/strict";
import test from "node:test";

import type { TripDraft } from "@/domain/trip-draft/trip-draft";
import { initializeTripState } from "@/domain/trip-state/trip-state";
import type { Journey } from "./journey-service";
import { createJourneyWithOpening } from "./create-journey-with-opening";

const draft: TripDraft = {
  name: { state: "missing" }, origin: { state: "missing" },
  destinationEdit: { operation: "set", places: ["梅里雪山"], broadRegion: null },
  startDate: { state: "approximate", value: "十月份" }, endDate: { state: "missing" },
  duration: { state: "known", value: "5天" }, transportPreference: { state: "missing" },
};
const journey: Journey = { trip: { id: "trip-a", status: "idea",
  createdAt: "2026-09-29T00:00:00.000Z", updatedAt: "2026-09-29T00:00:00.000Z" },
tripState: initializeTripState(draft) };
const meri = { providerId: "amap-meri", name: "梅里雪山", province: "云南省", city: "迪庆藏族自治州",
  district: "德钦县", region: "云南省迪庆藏族自治州", address: "德钦",
  longitude: 98.6, latitude: 28.4, coordinateSystem: "GCJ-02" as const };
const input = { draft, ownerGuestId: "guest-a", initialUserMessage: "想去梅里雪山",
  requestId: "request-a", referenceDate: "2026-09-29", timezone: "Asia/Shanghai" };

test("a first message naming a place the provider matches exactly starts the Journey with it", async () => {
  let savedDestination: unknown;
  let savedOpening: unknown;
  let openingCalls = 0;
  const result = await createJourneyWithOpening(input, {
    createJourney: async (_value, _owner, _message, opening, destination) => {
      savedOpening = opening; savedDestination = destination; return journey;
    },
    resolveDestination: async () => ({ status: "resolved", candidate: meri }),
    initializeOpening: async () => { openingCalls += 1; },
  });
  assert.equal(result.opening, "completed");
  assert.equal(savedOpening, undefined);
  assert.equal(openingCalls, 1);
  assert.deepEqual(savedDestination, { state: "known", source: "user", areas: [
    { province: "云南省", places: [{ name: "迪庆藏族自治州", spots: ["梅里雪山"] }] }] });
});

test("a first message the provider had to interpret stores an offer and keeps the destination missing", async () => {
  let savedDraft: unknown;
  let savedOpening: unknown;
  let savedDestination: unknown = "unset";
  let openingCalls = 0;
  const result = await createJourneyWithOpening({ ...input,
    draft: { ...draft, destinationEdit: { operation: "set", places: ["梅里"], broadRegion: null } } }, {
    createJourney: async (value, _owner, _message, opening, destination) => {
      savedDraft = value; savedOpening = opening; savedDestination = destination; return journey;
    },
    resolveDestination: async () => ({ status: "resolved", candidate: meri }),
    initializeOpening: async () => { openingCalls += 1; },
  });
  assert.equal(result.opening, "completed");
  assert.equal((savedDraft as typeof draft).destinationEdit.operation, "set");
  assert.equal(openingCalls, 0);
  assert.equal(savedDestination, undefined);
  assert.equal((savedOpening as { presentation: { type: string } }).presentation.type, "destination_choices");
  assert.match((savedOpening as { content: string }).content, /找到「梅里」相关的地点了/u);
});

test("unresolved first destination writes guidance without saving a false location", async () => {
  let openingContent = "";
  const result = await createJourneyWithOpening(input, {
    createJourney: async (_draft, _owner, _message, opening) => {
      openingContent = opening?.content ?? ""; return journey;
    },
    resolveDestination: async () => ({ status: "unresolved" }),
    initializeOpening: async () => { throw new Error("must not run"); },
  });
  assert.equal(result.opening, "completed");
  assert.match(openingContent, /没找到/u);
});

test("a preference-only first message uses the normal opening reply", async () => {
  let called = 0;
  const result = await createJourneyWithOpening({ ...input,
    draft: { ...draft, destinationEdit: { operation: "none" } } }, {
    createJourney: async () => journey,
    resolveDestination: async () => { throw new Error("must not search"); },
    initializeOpening: async () => { called += 1; },
  });
  assert.equal(result.opening, "completed");
  assert.equal(called, 1);
});

test("opening model failure leaves the created Journey available for retry", async () => {
  const result = await createJourneyWithOpening({ ...input,
    draft: { ...draft, destinationEdit: { operation: "none" } } }, {
    createJourney: async () => journey,
    resolveDestination: async () => { throw new Error("must not search"); },
    initializeOpening: async () => { throw new Error("model down"); },
  });
  assert.equal(result.opening, "failed");
  assert.equal(result.journey, journey);
});
