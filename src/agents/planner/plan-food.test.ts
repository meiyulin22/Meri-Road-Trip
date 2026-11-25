import assert from "node:assert/strict";
import test from "node:test";

import type { PlanDay } from "@/domain/plan/plan-draft";
import { createMoonshotChatModel } from "@/platform/llm/moonshot-chat-model";

import { planFood } from "./plan-food";
import { card, fiveDays, handoff } from "./plan-test-fixtures";

const town = { ...card("丽江古城"), mapCheck: { status: "located" as const, district: "古城区", point: { longitude: 100.234, latitude: 26.872 } } };
const cards = new Map([[town.id, town]]);
const days: PlanDay[] = [1, 2].map((day) => ({
  day, date: `2026-11-2${day}`, province: "云南省", city: "丽江市", arrivingFrom: null, focus: null, theme: null,
  stops: [{ spotId: town.id, slot: "morning" as const, anchor: null }],
}));
const results = {
  "特色美食": [{ source: "trip", url: "https://tw.trip.com/a", title: "麗江美食", snippet: "腊排骨火锅——高原风干腊排骨配酸菜熬煮" }],
  "附近": [
    { source: "amap", url: "https://www.amap.com/ranking/lijiang", title: "高德状元榜", snippet: "渣渣米线(古城店) 全年综合分4.86；阿妈意纳西餐厅 纳西菜" },
    { source: "ad", url: "https://post.smzdm.com/p/x", title: "丽江TOP5品牌推荐", snippet: "滇山雪鱼 品牌推荐" },
  ],
  "老字号": [{ source: "sina", url: "https://www.sina.cn/b", title: "老字号", snippet: "渣渣米线的过桥米线值得排队；阿妈意纳西餐厅的纳西烤鱼地道" }],
};

function answering(content: unknown, prompts: unknown[] = []) {
  return () => createMoonshotChatModel({
    apiKey: "test", baseUrl: "https://model.test/v1", model: "test",
    fetch: async (_url, init) => {
      const request = JSON.parse(String(init?.body)) as { messages: { content: string }[] };
      prompts.push(JSON.parse(request.messages.at(-1)?.content ?? "null"));
      return Response.json({ id: "chat", model: "test", created: 1,
        choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(content) }, finish_reason: "stop" }],
        usage: { prompt_tokens: 500, completion_tokens: 80, total_tokens: 580 } });
    },
  });
}

const answer = {
  dishes: [{ name: "腊排骨火锅", note: "纳西特色", sourceId: 1, quote: "腊排骨火锅——高原风干腊排骨配酸菜熬煮" }],
  restaurants: [
    { name: "渣渣米线(古城店)", dish: "过桥米线", mentions: [{ sourceId: 2, quote: "渣渣米线(古城店) 全年综合分4.86" }, { sourceId: 3, quote: "渣渣米线的过桥米线值得排队" }] },
    { name: "阿妈意纳西餐厅", dish: "纳西烤鱼", mentions: [{ sourceId: 2, quote: "阿妈意纳西餐厅 纳西菜" }, { sourceId: 3, quote: "阿妈意纳西餐厅的纳西烤鱼地道" }] },
  ],
};

test("three searches, the advertorial dropped, quotes checked, one restaurant on the map and one only in articles", async () => {
  const queries: string[] = [];
  const looked: string[] = [];
  const prompts: { sources: { site: string }[] }[] = [];
  const stop = { stopped: false };
  const result = await planFood(handoff(["丽江市"], fiveDays), days, cards, {
    search: async (query) => {
      queries.push(query);
      return results[Object.keys(results).find((key) => query.includes(key)) as keyof typeof results];
    },
    map: async (name) => {
      looked.push(name);
      return { status: "success", candidates: name.startsWith("渣渣") ? [{
        providerId: "1", name: "渣渣米线(古城店)", province: "云南省", city: "丽江市", district: "古城区", region: "云南省丽江市古城区",
        address: "七一街 8 号", longitude: 100.236, latitude: 26.873, coordinateSystem: "CGCS2000", kind: "other",
      }] : [] };
    },
  }, { model: answering(answer, prompts) }, stop);

  assert.deepEqual(queries, [
    "云南省 丽江市 特色美食 必吃 本地人推荐", "云南省 丽江市 丽江古城 附近 好吃的餐厅 本地人推荐", "云南省 丽江市 老字号 小吃 本地人常去",
  ]);
  // The advertorial never reaches the model.
  assert.deepEqual(prompts[0].sources.map(({ site }) => site), ["trip.com", "amap.com", "sina.cn"]);
  assert.deepEqual(looked, ["渣渣米线(古城店)", "阿妈意纳西餐厅"]);
  const [city] = result.food;
  assert.equal(city.status, "found");
  if (city.status !== "found") return;
  assert.deepEqual(city.dishes.map(({ name }) => name), ["腊排骨火锅"]);
  assert.deepEqual(city.restaurants.map(({ name, place }) => [name, place?.address, place?.near]), [["渣渣米线(古城店)", "七一街 8 号", "丽江古城"]]);
  assert.deepEqual(city.mentioned.map(({ name, evidence }) => [name, evidence.length]), [["阿妈意纳西餐厅", 2]]);
  assert.equal(city.lastDay, 2);
  assert.deepEqual([result.searches, result.lookups], [3, 2]);
});

test("a Tianditu failure stops the run's lookups; restaurants are still shown from their articles", async () => {
  const stop = { stopped: false };
  let lookups = 0;
  const result = await planFood(handoff(["丽江市"], fiveDays), days, cards, {
    search: async (query) => results[Object.keys(results).find((key) => query.includes(key)) as keyof typeof results],
    map: async () => { lookups += 1; return { status: "failure", reason: "http_error" }; },
  }, { model: answering(answer) }, stop);
  assert.equal(lookups, 1);
  assert.equal(stop.stopped, true);
  const [city] = result.food;
  assert.equal(city.status === "found" && city.mentioned.length, 2);
});

test("every search failing leaves the city unavailable; the plan goes on", async () => {
  const result = await planFood(handoff(["丽江市"], fiveDays), days, cards, {
    search: async () => { throw new Error("daily_limit"); }, map: async () => { throw new Error("no lookup"); },
  }, { model: () => { throw new Error("no model"); } }, { stopped: false });
  assert.deepEqual(result.food.map(({ status }) => status), ["unavailable"]);
});

test("one site and the map make a restaurant; one site without the map is not shown, and the searches go together", async () => {
  let inFlight = 0;
  let most = 0;
  const oneSite = {
    dishes: [],
    restaurants: [
      { name: "渣渣米线(古城店)", dish: null, mentions: [{ sourceId: 2, quote: "渣渣米线(古城店) 全年综合分4.86" }] },
      { name: "阿妈意纳西餐厅", dish: null, mentions: [{ sourceId: 2, quote: "阿妈意纳西餐厅 纳西菜" }] },
    ],
  };
  const result = await planFood(handoff(["丽江市"], fiveDays), days, cards, {
    search: async (query) => {
      inFlight += 1;
      most = Math.max(most, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return results[Object.keys(results).find((key) => query.includes(key)) as keyof typeof results];
    },
    map: async (name) => ({ status: "success", candidates: name.startsWith("渣渣") ? [{
      providerId: "1", name: "渣渣米线(古城店)", province: "云南省", city: "丽江市", district: "古城区", region: "云南省丽江市古城区",
      address: "七一街 8 号", longitude: 100.236, latitude: 26.873, coordinateSystem: "CGCS2000", kind: "other",
    }] : [] }),
  }, { model: answering(oneSite) }, { stopped: false });
  assert.equal(most, 3);
  const [city] = result.food;
  assert.equal(city.status, "found");
  if (city.status !== "found") return;
  assert.deepEqual(city.restaurants.map(({ name, evidence }) => [name, evidence.length]), [["渣渣米线(古城店)", 1]]);
  assert.deepEqual(city.mentioned, []);
});

const catalogDish = (name: string, sourceCount: number) => ({ id: `dish_${name}`, name, summary: `${name}的说明`, sourceCount });

test("with three catalog dishes or more, dishes come from the catalog and only restaurants are searched (RAG step 2)", async () => {
  const queries: string[] = [];
  const result = await planFood(handoff(["丽江市"], fiveDays), days, cards, {
    search: async (query) => {
      queries.push(query);
      return results[Object.keys(results).find((key) => query.includes(key)) as keyof typeof results];
    },
    map: async () => ({ status: "success", candidates: [] }),
    catalog: async () => ({ spots: [], dishes: [catalogDish("鸡豆凉粉", 1), catalogDish("丽江粑粑", 3), catalogDish("腊排骨", 2)] }),
  }, { model: answering(answer) }, { stopped: false });

  assert.equal(queries.length, 2);
  assert.ok(queries.every((query) => !query.includes("特色美食")));
  const [city] = result.food;
  assert.equal(city.status, "found");
  if (city.status !== "found") return;
  assert.deepEqual(city.dishes, [
    { name: "丽江粑粑", note: "丽江粑粑的说明", evidence: null },
    { name: "腊排骨", note: "腊排骨的说明", evidence: null },
    { name: "鸡豆凉粉", note: "鸡豆凉粉的说明", evidence: null },
  ]);
  assert.equal(result.searches, 2);
});

test("an English plan, or fewer than three catalog dishes, keeps the dish search", async () => {
  const english = { ...handoff(["丽江市"], fiveDays), locale: "en" as const };
  const dishes = [catalogDish("鸡豆凉粉", 1), catalogDish("丽江粑粑", 3), catalogDish("腊排骨", 2)];
  for (const [plan, catalog] of [[english, dishes], [handoff(["丽江市"], fiveDays), dishes.slice(0, 2)]] as const) {
    const queries: string[] = [];
    await planFood(plan, days, cards, {
      search: async (query) => {
        queries.push(query);
        return results[Object.keys(results).find((key) => query.includes(key)) as keyof typeof results];
      },
      map: async () => ({ status: "success", candidates: [] }),
      catalog: async () => ({ spots: [], dishes: catalog }),
    }, { model: answering(answer) }, { stopped: false });
    assert.equal(queries.length, 3);
  }
});
