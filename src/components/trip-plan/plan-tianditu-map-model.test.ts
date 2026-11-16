import assert from "node:assert/strict";
import test from "node:test";

import type { ReadyPlan } from "@/domain/plan/plan-draft-response";
import type { SpotCard } from "@/domain/plan/spot-card";

import { dayLines, dayOnMap, highlightedStops, labelLayer, mapStops, markerIcon, tileUrl } from "./plan-tianditu-map-model";

function card(id: string, mapCheck: SpotCard["mapCheck"]): SpotCard {
  return { id, province: "云南省", city: "丽江市", name: id, requested: false, location: null, opening: null, reservation: null,
    setting: null, walking: null, suggestedDuration: null, mapCheck };
}

const located = (longitude: number, latitude: number) => ({ status: "located" as const, district: "古城区", point: { longitude, latitude } });

function plan(spots: SpotCard[]): ReadyPlan {
  const day = (number: number, ids: string[]) => ({ day: number, date: null, province: "云南省", city: "丽江市", arrivingFrom: null,
    focus: null, theme: null, stops: ids.map((spotId) => ({ spotId, slot: "morning" as const, anchor: null })) });
  return {
    status: "ready",
    draft: { mode: "full", totalDays: 2, route: { source: "agent", cities: [], omitted: [] },
      days: [day(1, ["木府", "狮子山", "黑龙潭"]), day(2, ["玉龙雪山"])], conflicts: [], unverified: [] },
    spots, cities: [], pendingProvinces: [], dayPhotos: [], mapCheck: "complete",
  };
}

test("only located stops with coordinates are drawn, keeping their number in the day", () => {
  const stops = mapStops(plan([
    card("木府", located(100.23, 26.87)),
    card("狮子山", { status: "not_located" }),
    // Saved before 1.2100: located, but without a point.
    card("黑龙潭", { status: "located", district: "古城区", point: null }),
    card("玉龙雪山", located(100.2, 27.1)),
  ]));
  assert.deepEqual(stops.map(({ day, number, name }) => [day, number, name]), [[1, 1, "木府"], [2, 1, "玉龙雪山"]]);
  assert.deepEqual(highlightedStops(stops, 2).map(({ name }) => name), ["玉龙雪山"]);
  assert.equal(highlightedStops(stops, null).length, 2);
});

test("tiles come through Meri's relay with no key, with Chinese labels on every page for now (1.2104)", () => {
  assert.equal(tileUrl("cva"), "/api/map-tiles/cva/{z}/{x}/{y}");
  assert.equal(labelLayer(), "cva");
  assert.equal(tileUrl("vec"), "/api/map-tiles/vec/{z}/{x}/{y}");
});

test("the chosen day's pins are numbered; the others are small and plain", () => {
  const active = markerIcon(3, true);
  assert.equal(active.size, 28);
  assert.match(decodeURIComponent(active.url), />3<\/text>/u);
  const faint = markerIcon(3, false);
  assert.equal(faint.size, 18);
  assert.doesNotMatch(decodeURIComponent(faint.url), /<text/u);
});

test("a day with no located stop is placed by its city's stops on other days, or not at all (1.2101)", () => {
  const trip: ReadyPlan = {
    ...plan([card("木府", located(100.2, 26.8)), card("玉龙雪山", located(100.4, 27.0)), card("苍山", { status: "not_located" })]),
  };
  const days = (city: string, number: number, ids: string[]) => ({ day: number, date: null, province: "云南省", city, arrivingFrom: null,
    focus: null, theme: null, stops: ids.map((spotId) => ({ spotId, slot: "morning" as const, anchor: null })) });
  const withDays = { ...trip, draft: { ...trip.draft, days: [days("丽江市", 1, ["木府", "玉龙雪山"]), days("丽江市", 2, ["苍山"]), days("迪庆藏族自治州", 3, ["苍山"])] } };
  const stops = mapStops(withDays);
  assert.equal(dayOnMap(withDays, stops, 1).kind, "stops");
  const second = dayOnMap(withDays, stops, 2);
  assert.equal(second.kind, "city");
  if (second.kind === "city") {
    assert.equal(second.name, "丽江市");
    assert.ok(Math.abs(second.longitude - 100.3) < 1e-9 && Math.abs(second.latitude - 26.9) < 1e-9);
  }
  // 迪庆 has no located stop anywhere in the trip: the day cannot be placed.
  assert.equal(dayOnMap(withDays, stops, 3).kind, "unplaced");
});

test("a day's line follows the road where a leg was planned, and is straight and dashed elsewhere (1.2102)", () => {
  const trip = plan([card("木府", located(100.2, 26.8)), card("狮子山", located(100.21, 26.81)), card("黑龙潭", located(100.22, 26.88))]);
  const stops = mapStops(trip);
  const road = [[100.2, 26.8], [100.205, 26.805], [100.21, 26.81]] as [number, number][];
  const lines = dayLines(stops, [{ day: 1, fromSpotId: "木府", toSpotId: "狮子山", distanceKm: 1.2, durationMinutes: 5, path: road }], 1);
  assert.deepEqual(lines.map(({ kind, path }) => [kind, path.length]), [["road", 3], ["straight", 2]]);
  // The road stops 650 m short of an island: that stretch is dashed (1.2103).
  const island = dayLines(stops, [{ day: 1, fromSpotId: "木府", toSpotId: "狮子山", mode: "drive", distanceKm: 0.7, durationMinutes: 1,
    path: road, offRoadStartMeters: 0, offRoadEndMeters: 650 }], 1);
  assert.deepEqual(island.slice(0, 2).map(({ kind, path }) => [kind, path.length]), [["road", 2], ["straight", 2]]);
  // With 狮子山 not located, 木府 and 黑龙潭 are not neighbours: no line between them.
  const broken = mapStops(plan([card("木府", located(100.2, 26.8)), card("狮子山", { status: "not_located" }), card("黑龙潭", located(100.22, 26.88))]));
  assert.deepEqual(dayLines(broken, [], 1), []);
});
