import assert from "node:assert/strict";
import test from "node:test";

import type { LocationCandidate } from "@/domain/location/location";
import type { CityResearch, SpotCard } from "@/domain/plan/spot-card";
import type { LocationSearchResult } from "@/platform/location-provider/location-provider";
import { SpotLocationMemory } from "@/platform/tianditu/spot-location-memory";

import { checkSpotsOnMap, locateSpot } from "./map-check";

const evidence = { url: "https://example.com", title: "来源", publishedAt: null, checkedAt: "2026-11-13T08:00:00.000Z", quote: "原文" };

function card(name: string, overrides: Partial<SpotCard> = {}): SpotCard {
  return {
    id: name, province: "云南省", city: "大理白族自治州", name, requested: false,
    location: evidence, opening: null, reservation: null, setting: null, walking: null, suggestedDuration: null,
    mapCheck: { status: "unchecked" }, ...overrides,
  };
}

function place(name: string, province: string, city: string | null, district: string | null): LocationCandidate {
  return {
    providerId: `${province}${city}${name}`, name, province, city, district,
    region: [province, city, district].filter(Boolean).join(""), address: null,
    longitude: 100, latitude: 25, coordinateSystem: "CGCS2000",
  };
}

const gansuErhai = place("洱海", "甘肃省", "平凉市", "静宁县");
const daliErhai = place("洱海", "云南省", "大理白族自治州", "大理市");

test("locates a spot only inside its own city, allowing the scenic-area suffix", () => {
  assert.deepEqual(locateSpot(card("洱海"), [gansuErhai, daliErhai]),
    { status: "located", district: "大理市", mapName: "洱海" });
  assert.deepEqual(locateSpot(card("苍山"), [place("苍山风景区", "云南省", "大理白族自治州", "大理市")]),
    { status: "located", district: "大理市", mapName: "苍山风景区" });
  // Only the same-named place in 甘肃: not located, never moved to another city.
  assert.deepEqual(locateSpot(card("洱海"), [gansuErhai]), { status: "not_located" });
  assert.deepEqual(locateSpot(card("洱海"), [place("洱海公园停车场", "云南省", "大理白族自治州", "大理市")]),
    { status: "not_located" });
});

test("stops at the first failed lookup and leaves the rest unchecked", async () => {
  const searched: string[] = [];
  const answers: Record<string, LocationSearchResult> = {
    洱海: { status: "success", candidates: [daliErhai] },
    苍山: { status: "failure", reason: "http_error" },
  };
  const cities: CityResearch[] = [{
    province: "云南省", city: "大理白族自治州", status: "ready", searchCalls: 2,
    spots: [card("洱海"), card("没有出处", { location: null }), card("苍山"), card("崇圣寺三塔")],
  }];
  const memory = new SpotLocationMemory(null);
  const outcome = await checkSpotsOnMap(cities, {
    async search(name, areas) {
      searched.push(name);
      assert.deepEqual(areas, ["云南省", "大理白族自治州"]);
      return answers[name] ?? assert.fail(`${name} should not be looked up`);
    },
    memory,
  });

  assert.deepEqual(searched, ["洱海", "苍山"]);
  assert.equal(outcome.status, "stopped");
  assert.equal(outcome.lookups, 2);
  assert.deepEqual(outcome.cities[0].spots.map(({ name, mapCheck }) => [name, mapCheck.status]),
    [["洱海", "located"], ["没有出处", "unchecked"], ["苍山", "unchecked"], ["崇圣寺三塔", "unchecked"]]);
  // A failure is never remembered; a found spot is.
  assert.equal(memory.get("云南省|大理白族自治州|苍山"), null);
  assert.equal(memory.get("云南省|大理白族自治州|洱海")?.status, "located");
});

test("answers from memory without a lookup and checks at most twelve spots a city", async () => {
  let now = 0;
  const memory = new SpotLocationMemory(null, () => now);
  memory.set("云南省|大理白族自治州|洱海", { status: "located", district: "大理市", mapName: "洱海" });
  const spots = [card("洱海"), ...Array.from({ length: 13 }, (_, index) => card(`景点${index}`))];
  let lookups = 0;
  const outcome = await checkSpotsOnMap([{ province: "云南省", city: "大理白族自治州", status: "ready", searchCalls: 2, spots }], {
    async search() {
      lookups += 1;
      return { status: "success", candidates: [] };
    },
    memory,
  });

  assert.equal(lookups, 11);
  assert.equal(outcome.status, "complete");
  assert.deepEqual(outcome.cities[0].spots[0].mapCheck, { status: "located", district: "大理市" });
  assert.equal(outcome.cities[0].spots.filter(({ mapCheck }) => mapCheck.status === "not_located").length, 11);
  assert.equal(outcome.cities[0].spots.at(-1)?.mapCheck.status, "unchecked");

  // Not found is kept for a week, found for a month.
  now = 8 * 24 * 60 * 60 * 1_000;
  assert.equal(memory.get("云南省|大理白族自治州|景点0"), null);
  assert.equal(memory.get("云南省|大理白族自治州|洱海")?.status, "located");
});
