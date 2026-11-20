import assert from "node:assert/strict";
import test from "node:test";

import type { PlanDay } from "@/domain/plan/plan-draft";
import type { DayForecast, SpotWeather } from "@/domain/plan/weather";
import { createMoonshotChatModel } from "@/platform/llm/moonshot-chat-model";

import { dressDays } from "./day-outfits";
import { card, fiveDays, handoff } from "./plan-test-fixtures";

const on = (date: string, overrides: Partial<DayForecast> = {}): DayForecast => ({
  date, code: 1, high: 14, low: 2, precipitationMm: 0, precipitationChance: 0, snowfallCm: 0, gustKmh: 20, ...overrides,
});
const weather = (days: DayForecast[], elevation: number): SpotWeather => ({ status: "forecast", source: "spot", elevation, beyond: [], days });
const mountain = { ...card("玉龙雪山"), outdoor: true, weather: weather([on("2026-11-25", { low: -11, high: -2 })], 5369) };
const town = { ...card("丽江古城"), outdoor: true, weather: weather([on("2026-11-26", { low: 3, high: 15 })], 2403) };
const cards = new Map([mountain, town].map((item) => [item.id, item]));
const day = (number: number, date: string | null, spotId: string): PlanDay => ({
  day: number, date, province: "云南省", city: "丽江市", arrivingFrom: null, focus: null, theme: null,
  stops: [{ spotId, slot: "morning", anchor: null }],
});
const trip = handoff(["丽江市"], fiveDays);

/** A model that answers the outfit call with `content`, recording what it was asked. */
function answering(content: unknown, prompts: unknown[] = [], status = 200) {
  return () => createMoonshotChatModel({
    apiKey: "test", baseUrl: "https://model.test/v1", model: "test",
    fetch: async (_url, init) => {
      const request = JSON.parse(String(init?.body)) as { messages: { content: string }[] };
      prompts.push(JSON.parse(request.messages.at(-1)?.content ?? "null"));
      if (status !== 200) return new Response("unavailable", { status });
      return Response.json({
        id: "chat", model: "test", created: 1,
        choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(content) }, finish_reason: "stop" }],
        usage: { prompt_tokens: 300, completion_tokens: 60, total_tokens: 360 },
      });
    },
  });
}

test("one call dresses the whole trip: code's basics, the Plan Agent's checked additions and tip", async () => {
  const prompts: { days: { day: number; basics: string[]; weather: { place: string; elevation: number }[] }[] }[] = [];
  const result = await dressDays(trip, [day(2, "2026-11-25", mountain.id), day(3, "2026-11-26", town.id), day(4, null, town.id)], cards, {
    model: answering({ days: [
      { day: 2, extras: [{ name: "暖宝宝", slot: "bag", reason: "索道上 4506 m 风大" }, { name: "羽绒服", slot: "outer", reason: "dup" }],
        tip: "上午先上雪山，羽绒服山下可租。" },
      { day: 3, extras: "oops", tip: null },
    ] }, prompts),
  });

  assert.equal(result.status, "dressed");
  assert.deepEqual(result.usage, { inputTokens: 300, outputTokens: 60 });
  // The undated day has no outfit and is not asked about.
  assert.deepEqual(result.outfits.map(({ day: number }) => number), [2, 3]);
  assert.deepEqual(prompts[0].days.map(({ day: number }) => number), [2, 3]);
  assert.ok(prompts[0].days[0].basics.includes("羽绒服"));
  assert.deepEqual(prompts[0].days[0].weather.map(({ place, elevation }) => [place, elevation]), [["玉龙雪山", 5369]]);
  const [snowDay, townDay] = result.outfits;
  assert.deepEqual(snowDay.extras, [{ name: "暖宝宝", slot: "bag", reason: "索道上 4506 m 风大" }]);
  assert.equal(snowDay.tip, "上午先上雪山，羽绒服山下可租。");
  assert.ok(snowDay.items.some(({ id }) => id === "down_jacket"));
  assert.deepEqual(townDay.extras, []);
  assert.equal(townDay.tip, null);
});

test("a failed call keeps every day's basics; no forecast at all makes no call", async () => {
  const failed = await dressDays(trip, [day(2, "2026-11-25", mountain.id)], cards, { model: answering(null, [], 503) });
  assert.equal(failed.status, "basics_only");
  assert.ok(failed.outfits[0].items.some(({ id }) => id === "down_jacket"));
  assert.deepEqual(failed.outfits[0].extras, []);

  const unbuilt = await dressDays(trip, [day(2, "2026-11-25", mountain.id)], cards, { model: () => { throw new Error("no key"); } });
  assert.equal(unbuilt.status, "basics_only");

  const none = await dressDays(trip, [day(2, null, mountain.id)], cards, { model: () => { throw new Error("must not be built"); } });
  assert.deepEqual(none, { outfits: [], usage: { inputTokens: 0, outputTokens: 0 }, status: "none" });
});
