import assert from "node:assert/strict";
import test from "node:test";

import type { LocationField } from "@/domain/trip-state/trip-state";

import type { DayFrame } from "./plan-draft";
import { planDraftSchema } from "./plan-draft-response";
import { transferLegs } from "./transfer-legs";

const frame = (day: number, city: string, arrivingFrom: string | null = null): DayFrame =>
  ({ day, date: null, province: "云南省", city, arrivingFrom, focus: null, theme: null });
const trip = [frame(1, "丽江市"), frame(2, "丽江市"), frame(3, "大理白族自治州", "丽江市"), frame(4, "大理白族自治州")];
const shanghai: LocationField = { state: "known", value: "上海", source: "user" };
const shape = (legs: ReturnType<typeof transferLegs>) => legs.map(({ kind, day, from, to, estimate }) => [kind, day, from, to, estimate.status]);

test("code lists setting off, every change of city and the way back, from the route and the origin (1.2106)", () => {
  assert.deepEqual(shape(transferLegs(trip, shanghai, "full")), [
    ["outbound", 1, "上海", "丽江市", "not_looked_up"],
    ["between", 3, "丽江市", "大理白族自治州", "not_looked_up"],
    ["return", 4, "大理白族自治州", "上海", "not_looked_up"],
  ]);
  // One city: no change of city, still a way there and back.
  assert.deepEqual(shape(transferLegs(trip.slice(0, 2), shanghai, "full")).map(([kind]) => kind), ["outbound", "return"]);
});

test("without a usable origin the setting-off and return legs say why, and only the cities are looked up", () => {
  assert.deepEqual(shape(transferLegs(trip, { state: "missing" }, "full")), [
    ["outbound", 1, null, "丽江市", "origin_missing"],
    ["between", 3, "丽江市", "大理白族自治州", "not_looked_up"],
    ["return", 4, "大理白族自治州", null, "origin_missing"],
  ]);
  const rough = transferLegs(trip, { state: "approximate", value: "江浙一带", source: "user" }, "full");
  assert.deepEqual(shape(rough)[0], ["outbound", 1, "江浙一带", "丽江市", "origin_uncertain"]);
  assert.deepEqual(shape(rough)[2], ["return", 4, "大理白族自治州", "江浙一带", "origin_uncertain"]);
});

test("a preview plan shows only its first day, so it has no way back yet", () => {
  assert.deepEqual(shape(transferLegs([frame(1, "丽江市")], shanghai, "preview")), [["outbound", 1, "上海", "丽江市", "not_looked_up"]]);
  assert.deepEqual(transferLegs([], shanghai, "full"), []);
});

test("a saved plan's transfers are checked when read; plans from before 1.2106 have none and still read", () => {
  const draft = { mode: "full", totalDays: 4, route: { source: "agent", cities: [], omitted: [] }, days: [], conflicts: [], unverified: [] };
  assert.ok(planDraftSchema.safeParse(draft).success);
  const transfers = [
    { kind: "between", day: 3, from: "丽江市", to: "大理白族自治州", estimate: { status: "estimated", distanceKm: 186, durationMinutes: 163, path: [[100.2, 26.9], [100.2, 25.6]] } },
    { kind: "outbound", day: 1, from: null, to: "丽江市", estimate: { status: "origin_missing" } },
  ];
  assert.ok(planDraftSchema.safeParse({ ...draft, transfers }).success);
  assert.ok(!planDraftSchema.safeParse({ ...draft, transfers: [{ ...transfers[1], estimate: { status: "by_train" } }] }).success);
});
