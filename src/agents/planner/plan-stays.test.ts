import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import type { PlanDay } from "@/domain/plan/plan-draft";
import { createMoonshotChatModel } from "@/platform/llm/moonshot-chat-model";
import { parseHotelSearch, type HotelSearch } from "@/platform/hotel/rollinggo";

import { planStays } from "./plan-stays";
import { card, fiveDays, handoff } from "./plan-test-fixtures";

const hotels = parseHotelSearch(JSON.parse(readFileSync(join(import.meta.dirname, "../../platform/hotel/fixtures/rollinggo-search-lijiang-gucheng-2026-11-28.json"), "utf8"))) ?? [];
const town = { ...card("丽江古城"), mapCheck: { status: "located" as const, district: "古城区", point: { longitude: 100.234, latitude: 26.872 } } };
const cards = new Map([[town.id, town]]);
const day = (number: number): PlanDay => ({
  day: number, date: `2026-11-${26 + number}`, province: "云南省", city: "丽江市", arrivingFrom: null, focus: null, theme: null,
  stops: [{ spotId: town.id, slot: "morning", anchor: null }],
});
const days = [day(1), day(2), day(3)];
const detail = { phone: "0888-3012345", district: "丽江古城", checkIn: "14:00", checkOut: "12:00", facilities: ["电梯"], images: [] };
const now = () => new Date("2026-11-20T08:00:00.000Z");

function answering(content: unknown, prompts: unknown[] = []) {
  return () => createMoonshotChatModel({
    apiKey: "test", baseUrl: "https://model.test/v1", model: "test",
    fetch: async (_url, init) => {
      const request = JSON.parse(String(init?.body)) as { messages: { content: string }[] };
      prompts.push(JSON.parse(request.messages.at(-1)?.content ?? "null"));
      return Response.json({ id: "chat", model: "test", created: 1,
        choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(content) }, finish_reason: "stop" }],
        usage: { prompt_tokens: 200, completion_tokens: 30, total_tokens: 230 } });
    },
  });
}

test("no lodging preference: one search for the stay, three tiers by code, no model call, each shown hotel's page", async () => {
  const searches: HotelSearch[] = [];
  const looked: number[] = [];
  const trip = { ...handoff(["丽江市"], fiveDays), preferences: [] };
  const result = await planStays(trip, days, cards, {
    search: async (search) => { searches.push(search); return { status: "found", hotels }; },
    detail: async (id) => { looked.push(id); return detail; },
  }, { model: () => { throw new Error("no model call without preferences"); } }, now);

  assert.deepEqual(searches, [{ query: "丽江古城附近的酒店，住 2 晚", place: "丽江古城", placeType: "景点", checkIn: "2026-11-27", nights: 2 }]);
  const [stay] = result.stays;
  assert.equal(stay.status, "found");
  if (stay.status !== "found") return;
  assert.deepEqual(stay.tiers.map(({ tier, hotel }) => [tier, hotel.star]), [["budget", 2], ["comfort", 3], ["luxury", 5]]);
  assert.equal(stay.recommended, null);
  assert.equal(looked.length, 3);
  assert.equal(stay.tiers[0].detail?.phone, "0888-3012345");
  assert.equal(result.calls, 4);
});

test("with a lodging preference the Plan Agent picks one hotel from the list, with why; a pick off the list is dropped", async () => {
  const prompts: { preferences: { kind: string }[]; stays: { hotels: { hotelId: number }[] }[] }[] = [];
  const trip = handoff(["丽江市"], fiveDays);
  const withParents = { ...trip, preferences: [...trip.preferences, { ...trip.preferences[0], id: "p2", kind: "companions" as const, quote: "带爸妈，要有电梯" }] };
  const deps = { search: async () => ({ status: "found" as const, hotels }), detail: async () => detail };
  const picked = await planStays(withParents, days, cards, deps, {
    model: answering({ stays: [{ city: "丽江市", hotelId: 2437027, reason: "离古城 800 米，有电梯，适合带父母" }] }, prompts),
  }, now);
  const [stay] = picked.stays;
  assert.equal(stay.status === "found" && stay.recommended?.hotel.name, "呈境LIFE HOTEL(丽江古城南门木府店)");
  assert.equal(stay.status === "found" && stay.recommended?.reason, "离古城 800 米，有电梯，适合带父母");
  // Only lodging preferences reach the model: walking and companions here.
  assert.deepEqual(prompts[0].preferences.map(({ kind }) => kind), ["walking", "companions"]);
  assert.equal(prompts[0].stays[0].hotels.length, 5);
  assert.deepEqual(picked.usage, { inputTokens: 200, outputTokens: 30 });

  const offList = await planStays(withParents, days, cards, deps, { model: answering({ stays: [{ city: "丽江市", hotelId: 999, reason: "made up" }] }) }, now);
  assert.equal(offList.stays[0].status === "found" && offList.stays[0].recommended, null);
});

test("a search that fails leaves the stay unavailable; the plan goes on", async () => {
  const result = await planStays({ ...handoff(["丽江市"], fiveDays), preferences: [] }, days, cards, {
    search: async () => ({ status: "unavailable", reason: "failed" }), detail: async () => { throw new Error("no detail"); },
  }, { model: () => { throw new Error("no model"); } }, now);
  assert.deepEqual(result.stays.map(({ status, city }) => [status, city]), [["unavailable", "丽江市"]]);
});
