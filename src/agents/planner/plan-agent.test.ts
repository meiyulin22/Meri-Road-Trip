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
    preferences: [{ messageId: "message", quote: "少走台阶", createdAt: "2026-11-12T08:00:00.000Z" }],
  };
}

const sevenDays = { state: "known", value: "7天", source: "user" } as const;

function card(name: string, requested = false): SpotCard {
  return {
    id: JSON.stringify(["云南省", "丽江市", name]), province: "云南省", city: "丽江市", name, requested,
    location: { url: "https://example.com", title: name, publishedAt: null, checkedAt: "2026-11-12T08:00:00.000Z", quote: name + "位于丽江市" },
    opening: null, reservation: null, setting: null, walking: null, suggestedDuration: null,
  };
}

// Requested spots come first, as research builds them; s1 is 黑龙潭.
const spotNames = ["黑龙潭", "玉龙雪山", "丽江古城", "蓝月谷", "束河古镇", "拉市海", "白沙古镇", "玉水寨"];
const research: CityResearch[] = [{
  province: "云南省", city: "丽江市", status: "ready", searchCalls: 2,
  spots: spotNames.map((name, index) => card(name, index === 0)),
}];

type ProposedDay = { day: number; stops: { spotId: string; slot: string; anchor: null }[] };

function modelAnswering(answers: readonly ProposedDay[][], prompts: unknown[] = []) {
  let call = 0;
  return () => createMoonshotChatModel({
    apiKey: "test",
    baseUrl: "https://model.test/v1",
    model: "test",
    fetch: async (_url, init) => {
      const request = JSON.parse(String(init?.body)) as { messages: { role: string; content: string }[] };
      prompts.push(JSON.parse(request.messages.at(-1)?.content ?? "null"));
      const days = answers[call];
      call += 1;
      if (!days) return new Response("unavailable", { status: 503 });
      return Response.json({
        id: "chat-test", model: "test", created: 1,
        choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify({ days }) }, finish_reason: "stop" }],
        usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
      });
    },
  });
}

function day(dayNumber: number, ...ids: string[]): ProposedDay {
  return { day: dayNumber, stops: ids.map((spotId) => ({ spotId, slot: "morning", anchor: null })) };
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

test("reports an unavailable model and leaves several cities to the coming allocation", async () => {
  assert.deepEqual(await draftPlan(handoff(["丽江市"], sevenDays), research, { model: modelAnswering([]) }),
    { status: "unavailable" });
  assert.deepEqual(await draftPlan(handoff(["丽江市", "大理白族自治州"], sevenDays), research, {
    model() {
      assert.fail("Several cities should not reach the model yet");
    },
  }), { status: "unsupported", reason: "multiple_cities" });
});
