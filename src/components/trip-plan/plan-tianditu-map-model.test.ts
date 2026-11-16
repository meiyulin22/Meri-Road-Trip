import assert from "node:assert/strict";
import test from "node:test";

import type { ReadyPlan } from "@/domain/plan/plan-draft-response";
import type { SpotCard } from "@/domain/plan/spot-card";

import { highlightedStops, labelLayer, mapStops, markerIcon, tileUrl } from "./plan-tianditu-map-model";

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

test("tiles come from Tianditu's Web Mercator sets, with English labels on an English page", () => {
  assert.equal(labelLayer("en"), "eva");
  assert.equal(labelLayer("zh"), "cva");
  const url = tileUrl("vec", "k y", 3);
  assert.match(url, /^https:\/\/t3\.tianditu\.gov\.cn\/vec_w\/wmts\?/u);
  assert.match(url, /TILEMATRIX=\{z\}&TILEROW=\{y\}&TILECOL=\{x\}&tk=k%20y$/u);
});

test("the chosen day's pins are numbered; the others are small and plain", () => {
  const active = markerIcon(3, true);
  assert.equal(active.size, 28);
  assert.match(decodeURIComponent(active.url), />3<\/text>/u);
  const faint = markerIcon(3, false);
  assert.equal(faint.size, 18);
  assert.doesNotMatch(decodeURIComponent(faint.url), /<text/u);
});
