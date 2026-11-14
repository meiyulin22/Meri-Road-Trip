import assert from "node:assert/strict";
import test from "node:test";

import { PlanDraftRequestError, requestPlanDraft, sourceHost, sourcedFacts, stopsBySlot } from "@/components/trip-plan/plan-draft-model";
import type { PlanDraft } from "@/domain/plan/plan-draft";
import type { PlanHandoff } from "@/domain/plan/plan-handoff";
import type { CityResearch, SpotCard } from "@/domain/plan/spot-card";
import type { TripState } from "@/domain/trip-state/trip-state";
import { TripNotFoundError } from "@/domain/trip/trip-errors";

import { dayPhotos, handlePlanDraftPost } from "./plan-draft-handler";

const tripState: TripState = {
  name: { state: "missing" },
  origin: { state: "missing" },
  destination: { state: "known", source: "user", areas: [
    { province: "云南省", places: [{ name: "丽江市", spots: ["玉龙雪山"] }] },
    { province: "四川省", places: [] },
  ] },
  startDate: { state: "known", value: "2026-12-20", source: "user" },
  endDate: { state: "missing" },
  duration: { state: "known", value: "2天", source: "user" },
  transportPreference: { state: "missing" },
};
const handoff: PlanHandoff = {
  tripState, referenceDate: "2026-11-12", timezone: "Asia/Shanghai", locale: "zh",
  preferenceStatus: "ready", preferences: [{ id: "p1", label: "晚上逛古城", kind: "interests", quote: "晚上想逛古城", source: "conversation",
    messageId: "m1", createdAt: "2026-11-12T08:00:00.000Z" }],
};
const evidence = { url: "https://www.example.com/a", title: "来源", publishedAt: null, checkedAt: "2026-11-12T08:00:00.000Z", quote: "索道末班16:00" };

function card(name: string, overrides: Partial<SpotCard> = {}): SpotCard {
  return {
    id: name, province: "云南省", city: "丽江市", name, requested: false,
    location: { ...evidence, quote: name + "位于丽江市" }, opening: null, reservation: null,
    setting: null, walking: null, suggestedDuration: null, mapCheck: { status: "unchecked" }, ...overrides,
  };
}

const research: CityResearch[] = [{
  province: "云南省", city: "丽江市", status: "partial", searchCalls: 3,
  spots: [card("玉龙雪山", { requested: true, opening: evidence }), card("丽江古城"), card("黑龙潭")],
}];
const draft: PlanDraft = {
  mode: "full",
  totalDays: 2,
  days: [
    { day: 1, date: "2026-12-20", province: "云南省", city: "丽江市", stops: [
      { spotId: "丽江古城", slot: "evening", anchor: null },
      { spotId: "玉龙雪山", slot: "morning", anchor: { time: "16:00", reason: "索道末班 16:00", evidence } },
    ] },
    { day: 2, date: "2026-12-21", province: "云南省", city: "丽江市", stops: [] },
  ],
  conflicts: [{ kind: "not_enough_candidates", day: 2 }],
  unverified: [{ spotId: "丽江古城", fields: ["opening", "reservation"] }],
};
const unreachable = async (): Promise<never> => assert.fail("Dependency should not be called");

test("drafts from the saved journey and returns only the cards the plan uses", async () => {
  const result = await requestPlanDraft("trip-id", handoff, new AbortController().signal, async (url, init) => {
    assert.equal(url, "/api/trips/trip-id/plan-draft");
    assert.equal(init?.method, "POST");
    return handlePlanDraftPost("trip-id", "owner-id", JSON.parse(String(init?.body)), {
      async loadJourney(id, owner) {
        assert.deepEqual([id, owner], ["trip-id", "owner-id"]);
        return { tripState };
      },
      async research(received) {
        assert.deepEqual(received.preferences, handoff.preferences);
        return { cities: research, pendingProvinces: ["四川省"] };
      },
      async checkMap(cities) {
        assert.equal(cities, research);
        const [lijiang] = cities;
        return { status: "stopped", lookups: 1, cities: [{ ...lijiang, spots: lijiang.spots.map((spot) =>
          spot.name === "玉龙雪山" ? { ...spot, mapCheck: { status: "located", district: "玉龙纳西族自治县" } } : spot) }] };
      },
      async draft(_received, cities) {
        assert.equal(cities[0].spots[0].mapCheck.status, "located");
        return { status: "ready", draft, attempts: 1, usage: { inputTokens: 100, outputTokens: 20 } };
      },
      async findImage(subject) {
        // The catalog knows 玉龙雪山 and the city; 丽江古城 has no photo of its own.
        if (subject.spot === "玉龙雪山") return { url: "/photos/yulong.jpg", caption: "玉龙雪山" };
        if (subject.spot === null) return { url: "/photos/lijiang.jpg", caption: "丽江市" };
        return null;
      },
    });
  });

  assert.equal(result.status, "ready");
  if (result.status !== "ready") return;
  assert.deepEqual(result.spots.map(({ name }) => name), ["玉龙雪山", "丽江古城"]);
  assert.deepEqual(result.cities, [{ province: "云南省", city: "丽江市", status: "partial" }]);
  assert.deepEqual(result.pendingProvinces, ["四川省"]);
  assert.equal(result.mapCheck, "stopped");
  assert.deepEqual(result.spots[0].mapCheck, { status: "located", district: "玉龙纳西族自治县" });
  assert.equal(result.draft.days[0].stops[1].anchor?.time, "16:00");
  // Day 1 shows its first stop with a photo; day 2 has no stops and falls back to the city.
  assert.deepEqual(result.dayPhotos.map(({ day, image }) => [day, image.url]), [[1, "/photos/yulong.jpg"], [2, "/photos/lijiang.jpg"]]);
});

test("refuses a handoff that no longer matches the saved journey, before any research", async () => {
  const changed: TripState = { ...tripState, duration: { state: "known", value: "3天", source: "user" } };
  const response = await handlePlanDraftPost("trip-id", "owner-id", handoff, {
    loadJourney: async () => ({ tripState: changed }), research: unreachable, checkMap: unreachable, draft: unreachable, findImage: unreachable,
  });
  assert.equal(response.status, 409);
  await assert.rejects(requestPlanDraft("trip-id", handoff, new AbortController().signal, async () => response),
    (error) => error instanceof PlanDraftRequestError && error.reason === "journey_changed");
});

test("answers several cities without spending searches, and maps the other failures", async () => {
  const twoCities: TripState = { ...tripState, destination: { state: "known", source: "user", areas: [
    { province: "云南省", places: [{ name: "丽江市", spots: [] }, { name: "大理白族自治州", spots: [] }] },
  ] } };
  const unsupported = await handlePlanDraftPost("trip-id", "owner-id", { ...handoff, tripState: twoCities }, {
    loadJourney: async () => ({ tripState: twoCities }), research: unreachable, checkMap: unreachable, draft: unreachable, findImage: unreachable,
  });
  assert.deepEqual(await unsupported.json(), { status: "unsupported", reason: "multiple_cities" });

  const unavailable = await handlePlanDraftPost("trip-id", "owner-id", handoff, {
    loadJourney: async () => ({ tripState }),
    research: async () => ({ cities: research, pendingProvinces: [] }),
    checkMap: async (cities) => ({ cities: [...cities], status: "complete", lookups: 0 }),
    draft: async () => ({ status: "unavailable" }),
    findImage: unreachable,
  });
  assert.equal(unavailable.status, 503);

  assert.equal((await handlePlanDraftPost("trip-id", null, handoff, {
    loadJourney: unreachable, research: unreachable, checkMap: unreachable, draft: unreachable, findImage: unreachable,
  })).status, 404);
  assert.equal((await handlePlanDraftPost("trip-id", "owner-id", { tripState }, {
    loadJourney: unreachable, research: unreachable, checkMap: unreachable, draft: unreachable, findImage: unreachable,
  })).status, 400);
  assert.equal((await handlePlanDraftPost("trip-id", "owner-id", handoff, {
    loadJourney: async () => { throw new TripNotFoundError("trip-id"); }, research: unreachable, checkMap: unreachable, draft: unreachable,
    findImage: unreachable,
  })).status, 404);
});

test("the page groups a day by slot and shows each sourced fact once", () => {
  assert.deepEqual(stopsBySlot(draft.days[0]).map(({ slot, stops }) => [slot, stops.map(({ spotId }) => spotId)]),
    [["morning", ["玉龙雪山"]], ["evening", ["丽江古城"]]]);
  assert.deepEqual(stopsBySlot(draft.days[1]), []);
  assert.deepEqual(sourcedFacts(research[0].spots[0]).map(({ fact }) => fact), ["opening"]);
  assert.equal(sourceHost("https://www.example.com/a"), "example.com");
  assert.equal(sourceHost("not a url"), "not a url");
});

test("two days in one city prefer different photos and share the city's when nothing else is left", async () => {
  const days = [1, 2, 3].map((day) => ({ day, date: null, province: "云南省", city: "丽江市",
    stops: [{ spotId: day === 1 ? "玉龙雪山" : "丽江古城", slot: "morning" as const, anchor: null }] }));
  const photos = await dayPhotos(days, (spotId) => spotId, async (subject) =>
    subject.spot === "玉龙雪山" ? { url: "/photos/yulong.jpg", caption: "玉龙雪山" }
      : subject.spot === null ? { url: "/photos/lijiang.jpg", caption: "丽江市" } : null);
  assert.deepEqual(photos.map(({ day, image }) => [day, image.url]),
    [[1, "/photos/yulong.jpg"], [2, "/photos/lijiang.jpg"], [3, "/photos/lijiang.jpg"]]);
});
