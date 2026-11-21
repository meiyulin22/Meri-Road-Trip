import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { createDailyBudget } from "@/platform/http/daily-budget";
import type { Gate } from "@/platform/http/request-pacer";

import { createRollingGoHotels, parseHotelDetail, parseHotelSearch } from "./rollinggo";

// Recorded 2026-11-20 with two free calls: hotels within 2 km of 丽江古城 for 2026-11-28, and one hotel's own page.
const fixture = (name: string): unknown => JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", name), "utf8"));
const search = fixture("rollinggo-search-lijiang-gucheng-2026-11-28.json");
const detail = fixture("rollinggo-static-2437027.json");

const straightThrough: Gate = { run: (task) => task(), pause: () => {} };
const budget = (dailyUnits = 100) => createDailyBudget({ intervalMs: 0, dailyUnits, pauseMs: 60_000 },
  { file: null, gate: straightThrough, label: { provider: "RollingGo", units: (count) => `${count} calls` } });

test("the recorded search reads as hotels with a reference price, distance, star and photo", () => {
  const hotels = parseHotelSearch(search);
  assert.ok(hotels);
  assert.equal(hotels.length, 5);
  assert.deepEqual(hotels.map(({ name, star, pricePerNight, distanceM }) => [name, star, pricePerNight?.amount, distanceM]), [
    ["尚客优快捷酒店(丽江古城南门店)", 2, 86, 1553],
    ["花筑·古城木府酒店(丽江古城南门忠义市场店)", 4, 328, 1243],
    ["阿丹阁大酒店(丽江古城店)", 4, 164, 1420],
    ["呈境LIFE HOTEL(丽江古城南门木府店)", 3, 195, 799],
    ["丽江古城南门檀程·纪酒店", 5, 910, 476],
  ]);
  const [first] = hotels;
  assert.equal(first.point.latitude, 26.856566);
  assert.match(first.image ?? "", /^https:\/\/image-cdn\.rollinggo\.cn\//u);
  assert.ok(first.amenities.length > 0);
  // The booking link and its partner tracking are never kept.
  assert.ok(!JSON.stringify(hotels).includes("bookingUrl") && !JSON.stringify(hotels).includes("utm_source"));
});

test("a hotel that is not well formed is left out; an answer that is not a search is null", () => {
  const broken = structuredClone(search) as { hotelInformationList: Record<string, unknown>[] };
  broken.hotelInformationList[0].latitude = "north";
  broken.hotelInformationList[1].imageUrl = "https://evil.example.com/x.jpg";
  const hotels = parseHotelSearch(broken);
  assert.equal(hotels?.length, 4);
  assert.equal(hotels?.[0].image, null);
  assert.equal(parseHotelSearch({ success: false, code: 4001 }), null);
  assert.equal(parseHotelSearch("nonsense"), null);
  // The same answer as MCP text content reads the same.
  assert.equal(parseHotelSearch({ content: [{ type: "text", text: JSON.stringify(search) }] })?.length, 5);
});

test("the recorded hotel page reads as phone, district, check-in and out, facilities and photos", () => {
  const info = parseHotelDetail(detail);
  assert.ok(info);
  assert.equal(info.phone, "0888-3012345");
  assert.equal(info.checkIn, "14:00");
  assert.equal(info.checkOut, "12:00");
  assert.match(info.district ?? "", /丽江古城/u);
  assert.equal(info.facilities.length, 10);
  assert.equal(info.images.length, 5);
});

test("a search asks near the place for the stay's nights; off, capped or failing it is unavailable and pauses", async () => {
  const asked: { name: string; input: Record<string, unknown> }[] = [];
  const hotels = createRollingGoHotels({
    enabled: () => true, budget: budget(),
    tools: async () => async (name, input) => { asked.push({ name, input }); return search; },
  });
  const found = await hotels.search({ query: "丽江古城附近住 2 晚", place: "丽江古城", placeType: "景点", checkIn: "2026-11-27", nights: 2 });
  assert.equal(found.status === "found" && found.hotels.length, 5);
  assert.deepEqual(asked[0], { name: "searchHotels", input: {
    originQuery: "丽江古城附近住 2 晚", place: "丽江古城", placeType: "景点",
    checkInParam: { checkInDate: "2026-11-27", stayNights: 2, adultCount: 2 }, filterOptions: { distanceInMeter: 3000 }, size: 10,
  } });

  const off = createRollingGoHotels({ enabled: () => false, budget: budget(), tools: async () => { throw new Error("must not connect"); } });
  assert.deepEqual(await off.search({ query: "q", place: "丽江市", placeType: "城市", checkIn: "2026-11-27", nights: 1 }), { status: "unavailable", reason: "disabled" });

  const capped = createRollingGoHotels({ enabled: () => true, budget: budget(0.5), tools: async () => async () => search });
  assert.deepEqual(await capped.search({ query: "q", place: "丽江市", placeType: "城市", checkIn: "2026-11-27", nights: 1 }), { status: "unavailable", reason: "daily_limit" });

  let calls = 0;
  const failing = createRollingGoHotels({ enabled: () => true, budget: budget(), tools: async () => async () => { calls += 1; throw new Error("down"); } });
  assert.deepEqual(await failing.search({ query: "q", place: "丽江市", placeType: "城市", checkIn: "2026-11-27", nights: 1 }), { status: "unavailable", reason: "failed" });
  assert.deepEqual(await failing.search({ query: "q", place: "丽江市", placeType: "城市", checkIn: "2026-11-27", nights: 1 }), { status: "unavailable", reason: "paused" });
  assert.equal(calls, 1);
});
