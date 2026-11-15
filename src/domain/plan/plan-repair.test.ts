import assert from "node:assert/strict";
import test from "node:test";

import type { PlanDay } from "./plan-draft";
import { closedStops, moveClosedStops, stopChecks, verdictsFor } from "./plan-repair";
import type { SpotAvailability, SpotCard } from "./spot-card";

const evidence = { url: "https://example.com", title: "来源", publishedAt: null, checkedAt: "2026-11-15T08:00:00.000Z", quote: "…" };
const none: SpotAvailability = { checkedAt: "2026-11-15", hours: null, closedWeekdays: [], closedRanges: [], reservation: null, uncertain: [] };
function spot(id: string, availability: SpotAvailability = none): SpotCard {
  return { id, province: "云南省", city: "丽江市", name: id, requested: false, location: evidence, opening: null, reservation: null,
    setting: null, walking: null, suggestedDuration: null, mapCheck: { status: "unchecked" }, availability };
}
const frame = (day: number, date: string, stops: [string, "morning" | "afternoon" | "evening"][], arrivingFrom: string | null = null): PlanDay => ({
  day, date, province: "云南省", city: "丽江市", arrivingFrom, focus: null, theme: null,
  stops: stops.map(([spotId, slot]) => ({ spotId, slot, anchor: null })),
});

test("code moves a closed stop to an open day with room, or to the afternoon when it closes early", () => {
  const cards = new Map([
    ["museum", spot("museum", { ...none, closedWeekdays: [{ weekday: 1, scope: null, evidence }] })],
    ["park", spot("park", { ...none, hours: { open: "09:00", close: "17:00", evidence } })],
    ["old-town", spot("old-town")],
  ]);
  // 12-21 is a Monday.
  const days = [frame(1, "2026-12-21", [["museum", "morning"], ["park", "evening"]]), frame(2, "2026-12-22", [["old-town", "morning"]])];
  assert.deepEqual(closedStops(days, verdictsFor(days, cards, "2026-11-15")), [{ day: 1, spotId: "museum" }, { day: 1, spotId: "park" }]);

  const repaired = moveClosedStops(days, cards, "2026-11-15", 3);
  assert.deepEqual(repaired.days.map(({ stops }) => stops.map(({ spotId, slot }) => `${spotId}:${slot}`)),
    [["park:afternoon"], ["old-town:morning", "museum:morning"]]);
  assert.deepEqual(repaired.moved, [{ spotId: "museum", from: 1, to: 2 }]);
  assert.deepEqual(repaired.stuck, []);
  const checks = stopChecks(repaired.days, cards, verdictsFor(repaired.days, cards, "2026-11-15"), repaired.moved);
  assert.deepEqual(checks.map(({ spotId, status, movedFrom }) => [spotId, status, movedFrom]),
    // old-town was searched but nothing was found: unchecked, not open.
    [["park", "open", null], ["old-town", "unchecked", null], ["museum", "open", 1]]);
});

test("a stop with nowhere open to go is left for the Plan Agent; a transfer day keeps its morning free", () => {
  const cards = new Map([["museum", spot("museum", { ...none, closedWeekdays: [{ weekday: 1, scope: null, evidence }, { weekday: 2, scope: null, evidence }] })],
    ["a", spot("a")], ["b", spot("b")]]);
  const full = [frame(1, "2026-12-21", [["museum", "morning"]]), frame(2, "2026-12-22", [["a", "morning"]])];
  assert.deepEqual(moveClosedStops(full, cards, "2026-11-15", 3).stuck, [{ day: 1, spotId: "museum" }]);

  const open = new Map([["museum", spot("museum", { ...none, closedWeekdays: [{ weekday: 1, scope: null, evidence }] })], ["b", spot("b")]]);
  const transfer = [frame(1, "2026-12-21", [["museum", "morning"]]), frame(2, "2026-12-22", [["b", "afternoon"]], "大理白族自治州")];
  const moved = moveClosedStops(transfer, open, "2026-11-15", 3);
  assert.deepEqual(moved.days[1].stops.map(({ spotId, slot }) => `${spotId}:${slot}`), ["b:afternoon", "museum:afternoon"]);
});
