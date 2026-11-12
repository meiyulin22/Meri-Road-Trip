import assert from "node:assert/strict";
import test from "node:test";

import type { TripState } from "@/domain/trip-state/trip-state";

import { allocateDays, finishDraft, reviewProposal } from "./plan-draft";
import type { SpotCard, SpotEvidence } from "./spot-card";

function tripState(places: readonly string[], duration: TripState["duration"], startDate: TripState["startDate"] = { state: "missing" }): TripState {
  return {
    name: { state: "missing" },
    origin: { state: "missing" },
    destination: { state: "known", source: "user", areas: [
      { province: "云南省", places: places.map((name) => ({ name, spots: [] })) },
    ] },
    startDate,
    endDate: { state: "missing" },
    duration,
    transportPreference: { state: "missing" },
  };
}

function evidence(quote: string): SpotEvidence {
  return { url: "https://example.com", title: "来源", publishedAt: null, checkedAt: "2026-11-12T08:00:00.000Z", quote };
}

function card(name: string, overrides: Partial<SpotCard> = {}): SpotCard {
  return {
    id: name, province: "云南省", city: "丽江市", name, requested: false,
    location: evidence(name + "位于丽江市"), opening: null, reservation: null,
    setting: null, walking: null, suggestedDuration: null, ...overrides,
  };
}

test("an unconfirmed duration gives one preview day in the first city", () => {
  const allocation = allocateDays(tripState(["丽江市", "大理白族自治州"], { state: "approximate", value: "一周左右", source: "user" }));
  assert.deepEqual(allocation, {
    status: "ready", mode: "preview", totalDays: null,
    frames: [{ day: 1, date: null, province: "云南省", city: "丽江市" }],
  });
});

test("a single city takes every confirmed day, dated from the start date", () => {
  const allocation = allocateDays(tripState(["丽江市"], { state: "known", value: "7天", source: "user" },
    { state: "known", value: "2026-12-30", source: "user" }));
  assert.equal(allocation.status, "ready");
  if (allocation.status !== "ready") return;
  assert.equal(allocation.mode, "full");
  assert.equal(allocation.frames.length, 7);
  assert.deepEqual(allocation.frames.map(({ date }) => date), [
    "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03", "2027-01-04", "2027-01-05",
  ]);
});

test("several cities with a confirmed duration wait for the Plan Agent's allocation", () => {
  assert.deepEqual(allocateDays(tripState(["丽江市", "大理白族自治州"], { state: "known", value: "5天", source: "user" })),
    { status: "unsupported", reason: "multiple_cities" });
  assert.deepEqual(allocateDays(tripState([], { state: "known", value: "5天", source: "user" })),
    { status: "unsupported", reason: "no_city" });
});

test("review drops unknown spots, repeats and unsourced times, and reports each one", () => {
  const frames = [1, 2].map((day) => ({ day, date: null, province: "云南省", city: "丽江市" }));
  const cards = [
    card("玉龙雪山", { requested: true, opening: evidence("冰川公园索道末班16：00上行") }),
    card("丽江古城"),
    card("黑龙潭", { requested: true }),
  ];
  const review = reviewProposal("full", frames, cards, { days: [
    { day: 1, stops: [
      { spotId: "玉龙雪山", slot: "morning", anchor: { time: "16:00", reason: "索道末班 16:00" } },
      { spotId: "丽江古城", slot: "evening", anchor: { time: "20:00", reason: "夜景" } },
    ] },
    { day: 2, stops: [
      { spotId: "丽江古城", slot: "morning", anchor: null },
      { spotId: "蓝月谷", slot: "afternoon", anchor: null },
    ] },
  ] });

  assert.equal(review.days[0].stops[0].anchor?.evidence.quote, "冰川公园索道末班16：00上行");
  assert.equal(review.days[0].stops[1].anchor, null);
  assert.deepEqual(review.days[1].stops, []);
  assert.deepEqual(review.errors, [
    "Day 1: no source states 20:00 for 丽江古城.",
    "Day 2: 丽江古城 is already scheduled.",
    "Day 2: 蓝月谷 is not a candidate in 丽江市.",
    "Day 2 has no stops although candidates remain.",
    "黑龙潭 was requested by the user and is not scheduled.",
  ]);

  const draft = finishDraft({ status: "ready", mode: "full", totalDays: 2, frames }, cards, review.days);
  assert.deepEqual(draft.conflicts, [
    { kind: "requested_unscheduled", spotId: "黑龙潭" },
    { kind: "not_enough_candidates", day: 2 },
  ]);
  assert.deepEqual(draft.unverified, [
    { spotId: "玉龙雪山", fields: ["reservation", "setting", "walking", "suggestedDuration"] },
    { spotId: "丽江古城", fields: ["opening", "reservation", "setting", "walking", "suggestedDuration"] },
  ]);
});

test("a preview day leaves requested spots for the locked days", () => {
  const frames = [{ day: 1, date: null, province: "云南省", city: "丽江市" }];
  const cards = [card("玉龙雪山"), card("黑龙潭", { requested: true })];
  const review = reviewProposal("preview", frames, cards, { days: [
    { day: 1, stops: [{ spotId: "玉龙雪山", slot: "morning", anchor: null }] },
  ] });
  assert.deepEqual(review.errors, []);
  assert.deepEqual(finishDraft({ status: "ready", mode: "preview", totalDays: null, frames }, cards, review.days).conflicts, []);
});
