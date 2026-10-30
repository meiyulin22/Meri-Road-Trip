import assert from "node:assert/strict";
import test from "node:test";

import { navigationLinks, planCalendar, weatherKind } from "./plan-actions";
import { samplePlan } from "./plan-sample";

const xizhou = { name: "喜洲古镇", point: [100.131, 25.852] as const };

test("a stop opens in Amap, Apple Maps or Google Maps, coordinates sent as they are", () => {
  const zh = navigationLinks(xizhou, "zh");
  assert.deepEqual(zh.map((link) => link.app), ["amap", "apple", "google"]);
  assert.equal(zh[0].url, `https://uri.amap.com/marker?position=100.131,25.852&name=${encodeURIComponent("喜洲古镇")}&coordinate=wgs84&callnative=1&src=meri`);
  assert.equal(zh[2].url, "https://www.google.com/maps/dir/?api=1&destination=25.852%2C100.131&travelmode=driving");
  assert.deepEqual(navigationLinks(xizhou, "en").map((link) => link.app), ["google", "apple", "amap"]);
});

test("within about 16 days a day gets a forecast; further out, the usual weather for the season", () => {
  assert.equal(weatherKind("2026-11-14", "2026-10-30"), "forecast");
  assert.equal(weatherKind("2026-11-15", "2026-10-30"), "climate");
});

test("the calendar has one event per stop that is not a place to sleep, at the stop's local time", () => {
  const calendar = planCalendar(samplePlan.days, "2026-11-14", "zh", "丽江 → 大理");
  const events = calendar.split("BEGIN:VEVENT").length - 1;
  const stops = samplePlan.days.flatMap((day) => day.stops).filter((stop) => stop.kind !== "stay").length;
  assert.equal(events, stops);
  assert.ok(calendar.includes("DTSTART;TZID=Asia/Shanghai:20261114T073000"));
  assert.ok(calendar.includes("DTEND;TZID=Asia/Shanghai:20261114T103000"));
  assert.ok(calendar.includes("GEO:27.103;100.205"));
  assert.ok(calendar.startsWith("BEGIN:VCALENDAR\r\n") && calendar.endsWith("END:VCALENDAR\r\n"));
  // Commas in Meri's notes are escaped, so a calendar app doesn't cut the text short.
  assert.ok(!/DESCRIPTION:[^\r]*[^\\],/.test(calendar.replace(/，/g, "")));
});
