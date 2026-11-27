import assert from "node:assert/strict";
import test from "node:test";

import type { SpotCard } from "@/domain/plan/spot-card";
import { createMoonshotChatModel } from "@/platform/llm/moonshot-chat-model";

import { card } from "./plan-test-fixtures";
import { verifySpots } from "./verify-spots";

function modelAnswering(content: unknown, prompts: unknown[] = []) {
  return () => createMoonshotChatModel({
    apiKey: "test", baseUrl: "https://model.test/v1", model: "test",
    fetch: async (_url, init) => {
      const request = JSON.parse(String(init?.body)) as { messages: { content: string }[] };
      prompts.push(JSON.parse(request.messages.at(-1)?.content ?? "null"));
      return Response.json({
        id: "t", model: "test", created: 1,
        choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(content) }, finish_reason: "stop" }],
        usage: { prompt_tokens: 50, completion_tokens: 10, total_tokens: 60 },
      });
    },
  });
}

const yulong: SpotCard = card("玉龙雪山");
const options = { month: "2026年12月", referenceDate: "2026-11-15", locale: "zh" as const, budget: 24 };
const search = async (query: string) => query.includes("玉龙雪山")
  ? [{ source: "web", url: "https://example.com/yulong", title: "玉龙雪山景区最新游览须知",
      snippet: "玉龙雪山开放时间7:00-18:00，冰川公园大索道每周一检修停运，12月1日至次年3月31日蓝月谷部分区域封闭，需提前1天实名预约。",
      publishedAt: "2026-10-20" }]
  : [];

test("keeps only facts whose quote is in the source and whose values are in the quote", async () => {
  const progress: string[] = [];
  const result = await verifySpots([yulong], options, {
    search,
    model: modelAnswering({ spots: [{
      spot: "玉龙雪山",
      hours: { open: "7:00", close: "18:00", sourceId: 1, quote: "玉龙雪山开放时间7:00-18:00" },
      closedWeekdays: [
        { weekday: 1, scope: "冰川公园大索道", sourceId: 1, quote: "冰川公园大索道每周一检修停运" },
        // The weekday is not in its quote: dropped.
        { weekday: 3, scope: null, sourceId: 1, quote: "冰川公园大索道每周一检修停运" },
      ],
      closedRanges: [
        { from: "12-1", to: "3-31", scope: "蓝月谷部分区域", sourceId: 1, quote: "12月1日至次年3月31日蓝月谷部分区域封闭" },
        // The quote is not in any source: dropped.
        { from: "06-01", to: "06-30", scope: null, sourceId: 1, quote: "6月1日至6月30日闭园" },
      ],
      booking: "required", bookingDaysAhead: 1, bookingSourceId: 1, bookingQuote: "需提前1天实名预约",
      uncertain: [],
    }] }),
  }, ({ spot, done, total }) => progress.push(`${spot} ${done}/${total}`));

  const facts = result.availability.get(yulong.id);
  assert.ok(facts);
  assert.deepEqual(facts.hours && [facts.hours.open, facts.hours.close], ["07:00", "18:00"]);
  assert.deepEqual(facts.closedWeekdays.map(({ weekday, scope }) => [weekday, scope]), [[1, "冰川公园大索道"]]);
  assert.deepEqual(facts.closedRanges.map(({ from, to, scope }) => [from, to, scope]), [["12-01", "03-31", "蓝月谷部分区域"]]);
  assert.deepEqual(facts.reservation && [facts.reservation.required, facts.reservation.daysAhead], [true, 1]);
  assert.equal(facts.closedRanges[0].evidence.publishedAt, "2026-10-20");
  assert.equal(result.searches, 1);
  assert.deepEqual(progress, ["玉龙雪山 1/1"]);
});

test("stays within the search budget, and a spot without results stays unchecked", async () => {
  const lijiang = card("丽江古城");
  const result = await verifySpots([yulong, lijiang], { ...options, budget: 1 }, {
    search, model: modelAnswering({ spots: [] }),
  });
  assert.equal(result.searches, 1);
  // Searched, but nothing usable came back: an empty record, so it is not searched again.
  assert.deepEqual(result.availability.get(yulong.id)?.closedWeekdays, []);
  assert.equal(result.availability.has(lijiang.id), false);
});

// The second look (1.2113 step 1, plan C): code finds the spots the first look left without facts,
// the model decides which deserve a Kimi search and words it.
const mufu: SpotCard = card("木府");
const erhai: SpotCard = card("洱海");
const firstLook = async (query: string) => query.includes("玉龙雪山") ? search(query)
  : query.includes("木府") ? [{ source: "web", url: "https://example.com/mufu", title: "木府介绍", snippet: "木府是丽江古城里的土司府邸。" }]
    : [];
function deciding(secondLook: unknown | "fail", seen: unknown[] = []) {
  return () => createMoonshotChatModel({
    apiKey: "test", baseUrl: "https://model.test/v1", model: "test",
    fetch: async (_url, init) => {
      const request = JSON.parse(String(init?.body)) as { messages: { content: string }[]; response_format?: { json_schema?: { name?: string } } };
      const name = request.response_format?.json_schema?.name;
      if (name === "second_look") {
        seen.push(JSON.parse(request.messages.at(-1)?.content ?? "null"));
        if (secondLook === "fail") return new Response("unavailable", { status: 503 });
      }
      const content = name === "second_look" ? secondLook : { spots: [] };
      return Response.json({ id: "t", model: "test", created: 1,
        choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(content) }, finish_reason: "stop" }],
        usage: { prompt_tokens: 50, completion_tokens: 10, total_tokens: 60 } });
    },
  });
}

test("only spots without facts go to the model; it searches the gated site again and leaves the lake (1.2113)", async () => {
  const deep: string[] = [];
  const seen: unknown[] = [];
  const result = await verifySpots([yulong, mufu, erhai], options, {
    search: firstLook,
    deepSearch: async (query) => { deep.push(query); return []; },
    model: deciding({ spots: [
      { spot: "木府", search: true, query: "丽江木府 门票 开放时间 官网" },
      { spot: "洱海", search: false, query: null, reason: "开放水域，没有开放时间" },
    ] }, seen),
  });
  // 玉龙雪山's first results already say its hours, so the model never sees it.
  assert.deepEqual((seen[0] as { spots: { spot: string }[] }).spots.map(({ spot }) => spot), ["木府", "洱海"]);
  assert.deepEqual(deep, ["丽江市 丽江木府 门票 开放时间 官网"]);
  assert.equal(result.searches, 4);
});

test("when the model cannot decide, every spot without facts gets the fixed wording; the budget still holds", async () => {
  const deep: string[] = [];
  const result = await verifySpots([yulong, mufu, erhai], { ...options, budget: 4 }, {
    search: firstLook, deepSearch: async (query) => { deep.push(query); return []; }, model: deciding("fail"),
  });
  // One search left after the three first looks: the first spot without facts.
  assert.deepEqual(deep, ["丽江市 木府 门票 是否需要预约 开放时间 2026"]);
  assert.equal(result.searches, 4);
  // No room at all: no second look and no model call for it.
  const seen: unknown[] = [];
  await verifySpots([yulong, mufu, erhai], { ...options, budget: 3 }, {
    search: firstLook, deepSearch: async () => { throw new Error("no second look expected"); }, model: deciding({ spots: [] }, seen),
  });
  assert.deepEqual(seen, []);
});

/** A model that answers from what it was given: the source ids are numbered in whatever order the parallel searches finished. */
function modelFrom(answer: (prompt: { spots?: string[]; sources?: { sourceId: number; spotName?: string }[] }, isExtraction: boolean) => unknown | Response) {
  return () => createMoonshotChatModel({
    apiKey: "test", baseUrl: "https://model.test/v1", model: "test",
    fetch: async (_url, init) => {
      const request = JSON.parse(String(init?.body)) as { messages: { content: string }[]; response_format?: { json_schema?: { name?: string } } };
      const content = answer(JSON.parse(request.messages.at(-1)?.content ?? "{}"), request.response_format?.json_schema?.name === "spot_availability");
      if (content instanceof Response) return content;
      return Response.json({ id: "t", model: "test", created: 1,
        choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(content) }, finish_reason: "stop" }],
        usage: { prompt_tokens: 50, completion_tokens: 10, total_tokens: 60 } });
    },
  });
}
const idOf = (prompt: { sources?: { sourceId: number; spotName?: string }[] }, spot: string) =>
  prompt.sources?.find(({ spotName }) => spotName === spot)?.sourceId ?? 0;

const dragonPool: SpotCard = card("黑龙潭");
const searchBoth = async (query: string) => query.includes("黑龙潭")
  ? [{ source: "web", url: "https://example.com/pool", title: "黑龙潭公园", snippet: "黑龙潭公园开放时间7:00-20:00。", publishedAt: "2026-10-20" }]
  : search(query);

test("a malformed spot in the answer is dropped alone; the city's other spots keep their facts (2026-11-27)", async () => {
  const result = await verifySpots([yulong, dragonPool], options, {
    search: searchBoth,
    model: modelFrom((prompt, isExtraction) => isExtraction ? { spots: [
      { spot: "玉龙雪山", hours: { open: "7:00", close: "18:00", sourceId: idOf(prompt, "玉龙雪山"), quote: "玉龙雪山开放时间7:00-18:00" } },
      // A source id as words, not a number: this spot is dropped, the other kept.
      { spot: "黑龙潭", hours: { open: "7:00", sourceId: "第二条", quote: "黑龙潭公园开放时间7:00-20:00" } },
    ] } : { searches: [] }),
  });
  assert.deepEqual(result.availability.get(yulong.id)?.hours && [result.availability.get(yulong.id)?.hours?.open], ["07:00"]);
  assert.equal(result.availability.get(dragonPool.id)?.hours, null);
});

test("a city whose extraction call fails is tried once more with its first three spots", async () => {
  const names = ["玉龙雪山", "黑龙潭", "丽江古城", "束河古镇"];
  const cards = names.map((name) => card(name));
  const asked: string[][] = [];
  let extractions = 0;
  const model = modelFrom((prompt, isExtraction) => {
    if (!isExtraction) return { searches: [] };
    extractions += 1;
    asked.push(prompt.spots ?? []);
    if (extractions === 1) return new Response("upstream timeout", { status: 400 });
    return { spots: [{ spot: "玉龙雪山", hours: { open: "7:00", close: "18:00", sourceId: idOf(prompt, "玉龙雪山"), quote: "玉龙雪山开放时间7:00-18:00" } }] };
  });
  const everywhere = async (query: string) => {
    const name = names.find((one) => query.includes(one)) ?? "玉龙雪山";
    return [{ source: "web", url: `https://example.com/${encodeURIComponent(name)}`, title: name,
      snippet: name === "玉龙雪山" ? "玉龙雪山开放时间7:00-18:00" : `${name}开放时间8:00-18:00`, publishedAt: "2026-10-20" }];
  };
  const result = await verifySpots(cards, options, { search: everywhere, model });
  assert.equal(extractions, 2);
  assert.deepEqual(asked[1], ["玉龙雪山", "黑龙潭", "丽江古城"]);
  assert.deepEqual(result.availability.get(cards[0].id)?.hours?.open, "07:00");
});
