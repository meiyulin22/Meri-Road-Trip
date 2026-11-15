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
