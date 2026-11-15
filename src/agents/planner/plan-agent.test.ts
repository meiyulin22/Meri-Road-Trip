import assert from "node:assert/strict";
import test from "node:test";

import type { PlanHandoff } from "@/domain/plan/plan-handoff";
import type { CityResearch, SpotCard } from "@/domain/plan/spot-card";
import type { TripState } from "@/domain/trip-state/trip-state";
import { createMoonshotChatModel } from "@/platform/llm/moonshot-chat-model";

import { draftPlan } from "./plan-agent";

function handoff(places: readonly string[], duration: TripState["duration"]): PlanHandoff {
  return {
    tripState: {
      name: { state: "missing" },
      origin: { state: "missing" },
      destination: { state: "known", source: "user", areas: [
        { province: "云南省", places: places.map((name) => ({ name, spots: [] })) },
      ] },
      startDate: { state: "missing" },
      endDate: { state: "missing" },
      duration,
      transportPreference: { state: "missing" },
    },
    referenceDate: "2026-11-12",
    timezone: "Asia/Shanghai",
    locale: "zh",
    preferenceStatus: "ready",
    preferences: [{ id: "p1", label: "少爬台阶", kind: "walking", quote: "少走台阶", source: "conversation",
      messageId: "message", createdAt: "2026-11-12T08:00:00.000Z" }],
  };
}

const sevenDays = { state: "known", value: "7天", source: "user" } as const;

function card(name: string, requested = false, index = 0): SpotCard {
  return {
    id: JSON.stringify(["云南省", "丽江市", name]), province: "云南省", city: "丽江市", name, requested,
    location: { url: "https://example.com", title: name, publishedAt: null, checkedAt: "2026-11-12T08:00:00.000Z", quote: name + "位于丽江市" },
    opening: null, reservation: null, setting: null, walking: null, suggestedDuration: null,
    mapCheck: index % 2 === 0 ? { status: "located", district: "古城区" } : { status: "not_located" },
  };
}

// Requested spots come first, as research builds them; s1 is 黑龙潭.
const spotNames = ["黑龙潭", "玉龙雪山", "丽江古城", "蓝月谷", "束河古镇", "拉市海", "白沙古镇", "玉水寨"];
const research: CityResearch[] = [{
  province: "云南省", city: "丽江市", status: "ready", searchCalls: 2,
  spots: spotNames.map((name, index) => card(name, index === 0, index)),
}];

type ProposedDay = { day: number; stops: { spotId: string; slot: string; anchor: null }[] };

type RouteAnswer = { cities: { id: string; days: number; reason: string }[];
  days: { day: number; focus: string | null; theme: string | null }[]; omitted: { id: string; reason: string }[] };

function answer(content: unknown) {
  return Response.json({
    id: "chat-test", model: "test", created: 1,
    choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(content) }, finish_reason: "stop" }],
    usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
  });
}

/**
 * Answers the route call with the given routes in turn (none: the route call fails and
 * code shares the days out), and each day-selection call with the next set of days.
 */
function modelAnswering(answers: readonly ProposedDay[][], prompts: unknown[] = [], routes: readonly RouteAnswer[] = [],
  routePrompts: unknown[] = []) {
  let call = 0;
  let routeCall = 0;
  return () => createMoonshotChatModel({
    apiKey: "test",
    baseUrl: "https://model.test/v1",
    model: "test",
    fetch: async (_url, init) => {
      const request = JSON.parse(String(init?.body)) as {
        messages: { role: string; content: string }[]; response_format?: { json_schema?: { name?: string } };
      };
      const prompt = JSON.parse(request.messages.at(-1)?.content ?? "null");
      if (request.response_format?.json_schema?.name === "plan_route") {
        routePrompts.push(prompt);
        const route = routes[routeCall];
        routeCall += 1;
        return route ? answer(route) : new Response("unavailable", { status: 503 });
      }
      prompts.push(prompt);
      const days = answers[call];
      call += 1;
      if (!days) return new Response("unavailable", { status: 503 });
      return answer({ days });
    },
  });
}

function day(dayNumber: number, ...ids: string[]): ProposedDay {
  return { day: dayNumber, stops: ids.map((spotId) => ({ spotId, slot: "morning", anchor: null })) };
}

/** A transfer day's stops start after the arrival. */
function afternoon(proposed: ProposedDay): ProposedDay {
  return { ...proposed, stops: proposed.stops.map((stop) => ({ ...stop, slot: "afternoon" })) };
}

test("without a confirmed duration, plans one preview day from the first city", async () => {
  const prompts: unknown[] = [];
  const result = await draftPlan(handoff(["丽江市", "大理白族自治州"], { state: "missing" }), research, {
    model: modelAnswering([[day(1, "s2", "s3")]], prompts),
  });

  assert.equal(result.status, "ready");
  if (result.status !== "ready") return;
  assert.equal(result.draft.mode, "preview");
  assert.equal(result.draft.totalDays, null);
  assert.deepEqual(result.draft.days.map(({ city, stops }) => [city, stops.map(({ spotId }) => JSON.parse(spotId)[2])]),
    [["丽江市", ["玉龙雪山", "丽江古城"]]]);
  assert.deepEqual(result.draft.conflicts, []);
  assert.equal(result.attempts, 1);
  assert.deepEqual(result.usage, { inputTokens: 100, outputTokens: 20 });
  assert.equal((prompts[0] as { mode: string }).mode, "preview");
  // The model sees which candidates the map found, and in which district.
  const candidates = (prompts[0] as { candidates: { name: string; located: boolean; district: string | null }[] }).candidates;
  assert.deepEqual(candidates.slice(0, 2).map(({ name, located, district }) => [name, located, district]),
    [["黑龙潭", true, "古城区"], ["玉龙雪山", false, null]]);
});

test("a single city with seven confirmed days gets exactly seven days", async () => {
  const week = [day(1, "s1"), day(2, "s2"), day(3, "s3"), day(4, "s4"), day(5, "s5"), day(6, "s6"), day(7, "s7", "s8")];
  const result = await draftPlan(handoff(["丽江市"], sevenDays), research, { model: modelAnswering([week]) });

  assert.equal(result.status, "ready");
  if (result.status !== "ready") return;
  assert.equal(result.draft.mode, "full");
  assert.equal(result.draft.totalDays, 7);
  assert.deepEqual(result.draft.days.map(({ day: dayNumber, stops }) => [dayNumber, stops.length]),
    [[1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 2]]);
  assert.deepEqual(result.draft.conflicts, []);
  assert.equal(result.attempts, 1);
});

test("returns the problems once, then reports what still does not fit as conflicts", async () => {
  const prompts: unknown[] = [];
  const missingRequested = [day(1, "s2"), day(2, "s3"), day(3, "s4"), day(4, "s5"), day(5, "s6"), day(6, "s7"), day(7, "s8", "s99")];
  const result = await draftPlan(handoff(["丽江市"], sevenDays), research, {
    model: modelAnswering([missingRequested, missingRequested], prompts),
  });

  assert.equal(result.status, "ready");
  if (result.status !== "ready") return;
  assert.equal(result.attempts, 2);
  assert.deepEqual((prompts[1] as { problemsWithPreviousAnswer: string[] }).problemsWithPreviousAnswer, [
    "Day 7: s99 is not a candidate in 丽江市.",
    "黑龙潭 was requested by the user and is not scheduled.",
  ]);
  assert.deepEqual(result.draft.conflicts, [{ kind: "requested_unscheduled", spotId: research[0].spots[0].id }]);
  assert.equal(result.draft.days[6].stops.length, 1);
});

test("keeps the first reviewed proposal when the retry fails", async () => {
  const result = await draftPlan(handoff(["丽江市"], sevenDays), research, {
    model: modelAnswering([[day(1, "s2")]]),
  });

  assert.equal(result.status, "ready");
  if (result.status !== "ready") return;
  assert.equal(result.attempts, 2);
  assert.equal(result.draft.days[0].stops.length, 1);
  assert.equal(result.draft.conflicts.length, 7);
});

test("reports an unavailable model, and answers no city as unsupported", async () => {
  assert.deepEqual(await draftPlan(handoff(["丽江市"], sevenDays), research, { model: modelAnswering([]) }),
    { status: "unavailable" });
  assert.deepEqual(await draftPlan(handoff([], sevenDays), research, {
    model() {
      assert.fail("No city should not reach the model");
    },
  }), { status: "unsupported", reason: "no_city" });
});

const dali: CityResearch = {
  province: "云南省", city: "大理白族自治州", status: "ready", searchCalls: 2,
  spots: ["洱海", "崇圣寺三塔", "喜洲古镇"].map((name, index) => ({
    ...card(name, false, index), id: JSON.stringify(["云南省", "大理白族自治州", name]), city: "大理白族自治州",
    mapCheck: { status: "located" as const, district: "大理市" },
  })),
};
const fiveDays = { state: "known", value: "5天", source: "user" } as const;

test("routes Lijiang and Dali over five days: the Agent's order, a transfer day, every city covered", async () => {
  const routePrompts: { cities: { id: string; city: string; districts: string[] }[] }[] = [];
  const dayPrompts: { days: { day: number; city: string; arrivingFrom: string | null; focus: string | null }[] }[] = [];
  // Dali first, then Lijiang: s1–s8 are Lijiang's cards, s9–s11 Dali's.
  const result = await draftPlan(handoff(["丽江市", "大理白族自治州"], fiveDays), [research[0], dali], {
    model: modelAnswering([[day(1, "s9", "s10"), day(2, "s11"), afternoon(day(3, "s1", "s2")), day(4, "s3", "s4"), day(5, "s5")]],
      dayPrompts as unknown[], [{
        cities: [{ id: "c2", days: 2, reason: "洱海慢慢走" }, { id: "c1", days: 3, reason: "雪山和古城" }],
        days: [{ day: 1, focus: "大理市", theme: "洱海" }, { day: 3, focus: "古城区", theme: "古城" }],
        omitted: [],
      }], routePrompts as unknown[]),
  });

  assert.equal(result.status, "ready");
  if (result.status !== "ready") return;
  assert.deepEqual(routePrompts[0].cities.map(({ id, city, districts }) => [id, city, districts]),
    [["c1", "丽江市", ["古城区"]], ["c2", "大理白族自治州", ["大理市"]]]);
  assert.deepEqual(result.draft.route.cities.map(({ city, days }) => [city, days]), [["大理白族自治州", 2], ["丽江市", 3]]);
  assert.deepEqual(dayPrompts[0].days.map(({ day, city, arrivingFrom, focus }) => [day, city, arrivingFrom, focus]), [
    [1, "大理白族自治州", null, "大理市"], [2, "大理白族自治州", null, null],
    [3, "丽江市", "大理白族自治州", "古城区"], [4, "丽江市", null, null], [5, "丽江市", null, null],
  ]);
  assert.equal(result.draft.days.length, 5);
  assert.deepEqual(result.draft.conflicts, []);
  assert.equal(result.routeAttempts, 1);
});

test("a route that fails its checks twice falls back to the order the cities were added", async () => {
  const wrong = { cities: [{ id: "c1", days: 5, reason: "…" }], days: [], omitted: [] };
  const result = await draftPlan(handoff(["丽江市", "大理白族自治州"], fiveDays), [research[0], dali], {
    model: modelAnswering([[day(1, "s1"), day(2, "s2"), day(3, "s3"), afternoon(day(4, "s9")), day(5, "s10")]], [], [wrong, wrong]),
  });
  assert.equal(result.status, "ready");
  if (result.status !== "ready") return;
  assert.equal(result.routeAttempts, 2);
  assert.equal(result.draft.route.source, "fallback");
  assert.deepEqual(result.draft.route.cities.map(({ city, days }) => [city, days]), [["丽江市", 3], ["大理白族自治州", 2]]);
  assert.equal(result.draft.days[3].arrivingFrom, "丽江市");
});
