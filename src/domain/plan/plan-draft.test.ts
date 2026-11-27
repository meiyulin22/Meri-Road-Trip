import assert from "node:assert/strict";
import test from "node:test";

import type { TripState } from "@/domain/trip-state/trip-state";

import {
  fallbackRoute,
  finishDraft,
  isAreaName,
  legReach,
  planScope,
  reviewProposal,
  reviewRoute,
  splitRequested,
  type DayFrame,
  type RouteCityInput,
} from "./plan-draft";
import { spotCardSchema } from "./plan-draft-response";
import { isGrounded, type SpotCard, type SpotEvidence } from "./spot-card";

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
    setting: null, walking: null, suggestedDuration: null, mapCheck: { status: "unchecked" }, ...overrides,
  };
}

const route = { source: "agent", cities: [{ province: "云南省", city: "丽江市", days: 2, reason: null }], omitted: [] } as const;

function frame(day: number, overrides: Partial<DayFrame> = {}): DayFrame {
  return { day, date: null, province: "云南省", city: "丽江市", arrivingFrom: null, focus: null, theme: null, ...overrides };
}

const fiveDays = { state: "known", value: "5天", source: "user" } as const;

test("an unconfirmed duration scopes one preview day in the first city", () => {
  assert.deepEqual(planScope(tripState(["丽江市", "大理白族自治州"], { state: "approximate", value: "一周左右", source: "user" })), {
    status: "ready", mode: "preview", totalDays: null,
    cities: [{ province: "云南省", city: "丽江市" }], dates: [null],
  });
  assert.deepEqual(planScope(tripState([], fiveDays)), { status: "unsupported", reason: "no_city" });
});

test("a confirmed duration scopes every city across every day, dated from the start date", () => {
  const scope = planScope(tripState(["丽江市", "大理白族自治州"], { state: "known", value: "7天", source: "user" },
    { state: "known", value: "2026-12-30", source: "user" }));
  assert.equal(scope.status, "ready");
  if (scope.status !== "ready") return;
  assert.equal(scope.mode, "full");
  assert.deepEqual(scope.cities.map(({ city }) => city), ["丽江市", "大理白族自治州"]);
  assert.deepEqual(scope.dates, ["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03", "2027-01-04", "2027-01-05"]);
});

const twoCityScope = planScope(tripState(["丽江市", "大理白族自治州"], fiveDays));
const routeCities: RouteCityInput[] = [
  { id: "c1", province: "云南省", city: "丽江市", candidates: 7, districts: ["古城区", "玉龙纳西族自治县"] },
  { id: "c2", province: "云南省", city: "大理白族自治州", candidates: 3, districts: ["大理市"] },
];

test("a route in its own order becomes days city after city, with a transfer day and each day's focus", () => {
  assert.equal(twoCityScope.status, "ready");
  if (twoCityScope.status !== "ready") return;
  const review = reviewRoute(twoCityScope, routeCities, {
    cities: [{ id: "c2", days: 2, reason: "洱海慢慢走" }, { id: "c1", days: 3, reason: "雪山和古城" }],
    days: [
      { day: 1, focus: "大理市", theme: "洱海环线" }, { day: 3, focus: "古城区", theme: "古城慢逛" },
      { day: 4, focus: "玉龙纳西族自治县", theme: "雪山" },
    ],
    omitted: [],
  });
  assert.deepEqual(review.errors, []);
  assert.deepEqual(review.plan?.frames.map(({ day, city, arrivingFrom, focus }) => [day, city, arrivingFrom, focus]), [
    [1, "大理白族自治州", null, "大理市"], [2, "大理白族自治州", null, null],
    [3, "丽江市", "大理白族自治州", "古城区"], [4, "丽江市", null, "玉龙纳西族自治县"], [5, "丽江市", null, null],
  ]);
  assert.deepEqual(review.plan?.route.cities.map(({ city, days, reason }) => [city, days, reason]),
    [["大理白族自治州", 2, "洱海慢慢走"], ["丽江市", 3, "雪山和古城"]]);
});

test("a route that misses a city, miscounts days, leaves a city out needlessly or invents a district is sent back", () => {
  if (twoCityScope.status !== "ready") return;
  assert.deepEqual(reviewRoute(twoCityScope, routeCities, {
    cities: [{ id: "c1", days: 4, reason: "…" }, { id: "c9", days: 1, reason: "…" }], days: [], omitted: [],
  }).errors, ["c9 is not one of the trip's cities.", "大理白族自治州 is neither routed nor left out with a reason."]);
  assert.deepEqual(reviewRoute(twoCityScope, routeCities, {
    cities: [{ id: "c1", days: 4, reason: "…" }], days: [], omitted: [{ id: "c2", reason: "太远" }],
  }).errors, ["There are 5 days for 2 cities: route every city that has candidates, at least one day each, and give any extra days to the cities that deserve them. If the trip is tight, say so in the reasons; do not leave a city out.", "The routed days add up to 4, not 5."]);
  // A city where research found nothing may be left out, with its days going elsewhere.
  const empty = [routeCities[0], { ...routeCities[1], candidates: 0, districts: [] }];
  const review = reviewRoute(twoCityScope, empty, {
    cities: [{ id: "c1", days: 5, reason: "…" }], days: [], omitted: [{ id: "c2", reason: "这次没查到大理的景点" }],
  });
  assert.deepEqual(review.errors, []);
  assert.deepEqual(review.plan?.route.omitted, [{ province: "云南省", city: "大理白族自治州", reason: "这次没查到大理的景点" }]);
  assert.deepEqual(reviewRoute(twoCityScope, routeCities, {
    cities: [{ id: "c1", days: 3, reason: "…" }, { id: "c2", days: 2, reason: "…" }],
    days: [{ day: 4, focus: "古城区", theme: null }], omitted: [],
  }).errors, ["Day 4: 古城区 is not a district the map found in 大理白族自治州."]);
});

test("with fewer days than cities the route may leave cities out, and the fallback keeps the first ones", () => {
  const scope = planScope(tripState(["丽江市", "大理白族自治州", "迪庆藏族自治州"], { state: "known", value: "2天", source: "user" }));
  if (scope.status !== "ready") return;
  const cities = [...routeCities, { id: "c3", province: "云南省", city: "迪庆藏族自治州", candidates: 4, districts: [] }];
  const review = reviewRoute(scope, cities, {
    cities: [{ id: "c1", days: 1, reason: "…" }, { id: "c2", days: 1, reason: "…" }], days: [],
    omitted: [{ id: "c3", reason: "离大理和丽江都要 4 小时以上" }],
  });
  assert.deepEqual(review.plan?.route.omitted, [{ province: "云南省", city: "迪庆藏族自治州", reason: "离大理和丽江都要 4 小时以上" }]);

  const fallback = fallbackRoute(scope);
  assert.equal(fallback.route.source, "fallback");
  assert.deepEqual(fallback.route.cities.map(({ city, days }) => [city, days]), [["丽江市", 1], ["大理白族自治州", 1]]);
  assert.deepEqual(fallback.route.omitted.map(({ city }) => city), ["迪庆藏族自治州"]);
  if (twoCityScope.status === "ready") {
    assert.deepEqual(fallbackRoute(twoCityScope).route.cities.map(({ days }) => days), [3, 2]);
  }
});

test("review drops unknown spots, repeats and unsourced times, and reports each one", () => {
  const frames = [frame(1), frame(2)];
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

  const draft = finishDraft({ mode: "full", totalDays: 2, frames, route }, cards, review.days);
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
  const frames = [frame(1)];
  const cards = [card("玉龙雪山"), card("黑龙潭", { requested: true })];
  const review = reviewProposal("preview", frames, cards, { days: [
    { day: 1, stops: [{ spotId: "玉龙雪山", slot: "morning", anchor: null }] },
  ] });
  assert.deepEqual(review.errors, []);
  assert.deepEqual(finishDraft({ mode: "preview", totalDays: null, frames, route }, cards, review.days).conflicts, []);
});

test("a transfer day has no morning", () => {
  const review = reviewProposal("full", [frame(1, { arrivingFrom: "大理白族自治州" })], [card("玉龙雪山"), card("丽江古城")], { days: [
    { day: 1, stops: [{ spotId: "玉龙雪山", slot: "morning", anchor: null }, { spotId: "丽江古城", slot: "evening", anchor: null }] },
  ] });
  assert.deepEqual(review.days[0].stops.map(({ spotId }) => spotId), ["丽江古城"]);
  assert.deepEqual(review.errors, ["Day 1 is a transfer day from 大理白族自治州: 玉龙雪山 cannot be in the morning."]);
});

test("a transfer day takes one stop fewer", () => {
  const cards = ["玉龙雪山", "丽江古城", "黑龙潭", "木府"].map((name) => card(name));
  const review = reviewProposal("full", [frame(1, { arrivingFrom: "大理白族自治州" })], cards, { days: [
    { day: 1, stops: cards.map(({ id }) => ({ spotId: id, slot: "afternoon" as const, anchor: null })) },
  ] });
  assert.equal(review.days[0].stops.length, 3);
  assert.deepEqual(review.errors, ["Day 1 has more than 3 stops."]);
});

test("a county-level name under another city is an area, not a spot to visit", () => {
  assert.equal(isAreaName("大理市", "大理白族自治州"), true);
  assert.equal(isAreaName("香格里拉市", "迪庆藏族自治州"), true);
  assert.equal(isAreaName("玉龙纳西族自治县", "丽江市"), true);
  assert.equal(isAreaName("额尔古纳市", "呼伦贝尔市"), true);
  assert.equal(isAreaName("阿尔山市", "兴安盟"), true);
  // The city itself, scenic areas and plain spots stay spots.
  assert.equal(isAreaName("丽江市", "丽江市"), false);
  assert.equal(isAreaName("玉龙雪山景区", "丽江市"), false);
  assert.equal(isAreaName("古城区", "丽江市"), false);
  assert.equal(isAreaName("洱海", "大理白族自治州"), false);
  assert.deepEqual(splitRequested(["大理市", "洱海", "崇圣寺三塔"], "大理白族自治州"),
    { spots: ["洱海", "崇圣寺三塔"], areas: ["大理市"] });
});

test("a leg's reach: no way, a large area at either end, or a way with stretches worth saying (1.2105)", () => {
  const base = { day: 1, fromSpotId: "a", toSpotId: "b", mode: "drive" as const, distanceKm: 2, durationMinutes: 4, path: [] };
  assert.deepEqual(legReach({ ...base, mode: "none" }), { kind: "none" });
  assert.deepEqual(legReach({ ...base, offRoadStartMeters: 1001, offRoadEndMeters: 0 }), { kind: "area", fromIsArea: true, toIsArea: false });
  assert.deepEqual(legReach({ ...base, offRoadStartMeters: 0, offRoadEndMeters: 1700 }), { kind: "area", fromIsArea: false, toIsArea: true });
  assert.deepEqual(legReach({ ...base, offRoadStartMeters: 1000, offRoadEndMeters: 300 }), { kind: "way", startGapMeters: 1000, endGapMeters: 0 });
  assert.deepEqual(legReach({ ...base, offRoadStartMeters: 299, offRoadEndMeters: 301 }), { kind: "way", startGapMeters: 0, endGapMeters: 301 });
  // Saved before 1.2103: no off-road measures.
  assert.deepEqual(legReach(base), { kind: "way", startGapMeters: 0, endGapMeters: 0 });
});

test("a catalog card is left to check only for opening and booking, and reads back from a saved plan (RAG step 2)", () => {
  const catalog = { id: "spot_lijiang_town", summary: "丽江的古城。", highlights: ["四方街"] };
  const cards = [card("丽江古城", { location: null, catalog })];
  const day = { day: 1, stops: [{ spotId: "丽江古城", slot: "morning" as const, anchor: null }] };
  const draft = finishDraft({ mode: "full", totalDays: 1, frames: [frame(1)], route: { ...route, cities: [{ ...route.cities[0], days: 1 }] } },
    cards, [{ ...frame(1), ...day }]);
  assert.deepEqual(draft.unverified, [
    { spotId: "丽江古城", fields: ["opening", "reservation"] },
  ]);
  assert.deepEqual(spotCardSchema.parse(cards[0]).catalog, catalog);
  const withTips = { ...catalog, tips: [{ name: "古城石板街", advice: "提前问住处能否接行李。", appliesIn: "步行携带行李" }] };
  assert.deepEqual(spotCardSchema.parse({ ...cards[0], catalog: withTips }).catalog, withTips);
  assert.equal(isGrounded(cards[0]), true);
  assert.equal(isGrounded(card("没有依据", { location: null })), false);
});
