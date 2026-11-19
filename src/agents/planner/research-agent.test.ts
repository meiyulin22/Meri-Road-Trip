import assert from "node:assert/strict";
import test from "node:test";

import type { PlanHandoff } from "@/domain/plan/plan-handoff";
import { createMoonshotChatModel } from "@/platform/llm/moonshot-chat-model";

import { researchTasks, runFirstRoundResearch } from "./research-agent";

const handoff: PlanHandoff = {
  tripState: {
    name: { state: "missing" },
    origin: { state: "missing" },
    destination: {
      state: "known",
      source: "user",
      areas: [
        { province: "云南省", places: [
          { name: "大理白族自治州", spots: ["苍山", "未查到的景点", "洱海"] },
          { name: "丽江市", spots: ["玉龙雪山"] },
        ] },
        { province: "四川省", places: [] },
      ],
    },
    startDate: { state: "missing" },
    endDate: { state: "missing" },
    duration: { state: "known", value: "5天", source: "user" },
    transportPreference: { state: "missing" },
  },
  referenceDate: "2026-11-11",
  timezone: "Asia/Shanghai",
  locale: "zh",
  preferenceStatus: "ready",
  preferences: [{ id: "p1", label: "少爬台阶", kind: "walking", pace: null, quote: "少走台阶", source: "conversation",
    messageId: "message", createdAt: "2026-11-11T08:00:00.000Z" }],
};

type ChatRequest = {
  readonly stream?: boolean;
  readonly messages: readonly { readonly content: string }[];
  readonly response_format?: { readonly json_schema?: { readonly name?: string } };
  readonly tools?: readonly { readonly function: { readonly name: string } }[];
};

function chatResponse(
  request: ChatRequest,
  message: { content: string | null; tool_calls?: unknown },
  finishReason = "stop",
): Response {
  const response = { id: "chat-test", model: "test", created: 1 };
  if (!request.stream) {
    return Response.json({
      ...response,
      choices: [{ index: 0, message: { role: "assistant", ...message }, finish_reason: finishReason }],
    });
  }
  return new Response([
    { ...response, choices: [{ index: 0, delta: { role: "assistant", ...message }, finish_reason: null }] },
    { ...response, choices: [{ index: 0, delta: {}, finish_reason: finishReason }] },
  ].map((chunk) => "data: " + JSON.stringify(chunk) + "\n\n").join("") + "data: [DONE]\n\n", {
    headers: { "content-type": "text/event-stream" },
  });
}

function schemaName(request: ChatRequest): string | undefined {
  return request.response_format?.json_schema?.name;
}

test("nominates spots, searches them with the named ones, and keeps only what a source supports", async () => {
  const queries: string[] = [];
  const schemas: (string | undefined)[] = [];
  const cite = (sourceId: number, quote: string) => ({ sourceId, quote });
  const unknown = { opening: null, reservation: null, setting: null, walking: null, suggestedDuration: null };
  const model = createMoonshotChatModel({
    apiKey: "test",
    baseUrl: "https://model.test/v1",
    model: "test",
    fetch: async (_url, init) => {
      const request = JSON.parse(String(init?.body)) as ChatRequest;
      const prompt = request.messages.at(-1)?.content ?? "";
      schemas.push(schemaName(request) ?? (request.tools ? "tools" : undefined));
      if (request.tools) return chatResponse(request, { content: "enough" });
      if (schemaName(request) === "spot_nominations") {
        const spots = prompt.includes("大理") ? ["崇圣寺三塔", "喜洲古镇", "洱海"] : [];
        return chatResponse(request, { content: JSON.stringify({ spots }) });
      }
      return chatResponse(request, { content: JSON.stringify({ spots: [
        { name: "苍山", location: { ...cite(1, "苍山位于云南省大理市"), cityName: "云南省大理市" }, ...unknown,
          reservation: cite(1, "苍山游览需预约"), suggestedDuration: cite(99, "苍山游览需预约") },
        { name: "崇圣寺三塔", location: { ...cite(3, "崇圣寺三塔位于大理市"), cityName: "大理市" }, ...unknown },
        { name: "喜洲古镇", location: { ...cite(3, "喜洲古镇位于大理市"), cityName: "大理市" }, ...unknown },
      ] }) });
    },
  });
  const result = await runFirstRoundResearch(handoff, {
    model: () => model,
    async search(query) {
      queries.push(query);
      if (query.includes("丽江市")) throw new Error("Search unavailable");
      if (query.includes("崇圣寺三塔")) {
        return [{ source: "example", title: "崇圣寺三塔", snippet: "崇圣寺三塔位于大理市", url: "https://example.com/pagodas" }];
      }
      return [
        { source: "example", title: "苍山", snippet: "苍山位于云南省大理市，苍山游览需预约",
          url: "https://example.com/cangshan", publishedAt: "2026-11-10" },
        { source: "example", title: "洱海（云南省大理白族自治州境内的湖泊）", url: "https://example.com/erhai" },
      ];
    },
  });

  // Five days across two cities: an even share is eight candidates each.
  assert.deepEqual(queries.filter((query) => query.startsWith("云南省 大理白族自治州 ")), [
    "云南省 大理白族自治州 景点 苍山 未查到的景点 洱海",
    "云南省 大理白族自治州 景点 崇圣寺三塔 喜洲古镇",
  ]);
  assert.deepEqual(queries.filter((query) => query.startsWith("云南省 丽江市 ")), ["云南省 丽江市 景点 玉龙雪山"]);
  assert.deepEqual(result.pendingProvinces, ["四川省"]);
  assert.deepEqual(result.cities.map(({ city, status, searchCalls }) => [city, status, searchCalls]), [
    ["大理白族自治州", "partial", 2],
    ["丽江市", "unavailable", 1],
  ]);
  assert.deepEqual(schemas.filter((name) => name === "spot_cards"), ["spot_cards"]);

  const [dali, lijiang] = result.cities;
  assert.deepEqual(dali.spots.map(({ name, requested }) => [name, requested]), [
    ["苍山", true], ["未查到的景点", true], ["洱海", true], ["崇圣寺三塔", false],
  ]);
  const [cangshan, unresolved, erhai, pagodas] = dali.spots;
  assert.equal(cangshan.location?.url, "https://example.com/cangshan");
  assert.equal(cangshan.location?.publishedAt, "2026-11-10");
  assert.match(cangshan.location?.checkedAt ?? "", /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(cangshan.reservation?.quote, "苍山游览需预约");
  assert.equal(cangshan.suggestedDuration, null);
  assert.equal(unresolved.location, null);
  assert.equal(erhai.location?.url, "https://example.com/erhai");
  assert.equal(pagodas.location?.url, "https://example.com/pagodas");
  assert.deepEqual(lijiang.spots.map(({ name, requested, location }) => [name, requested, location]), [["玉龙雪山", true, null]]);
});

test("with unconfirmed duration, researches only the first saved city", async () => {
  const queries: string[] = [];
  let modelCalls = 0;
  const result = await runFirstRoundResearch({
    ...handoff,
    tripState: { ...handoff.tripState, duration: { state: "approximate", value: "一周左右", source: "user" } },
  }, {
    model() {
      modelCalls += 1;
      throw new Error("Model unavailable");
    },
    async search(query) {
      queries.push(query);
      throw new Error("Search unavailable");
    },
  });

  // Without nominations the named spots are still searched.
  assert.deepEqual(queries, ["云南省 大理白族自治州 景点 苍山 未查到的景点 洱海"]);
  assert.equal(modelCalls, 1);
  assert.equal(result.cities[1]?.status, "deferred");
  assert.equal(result.cities[1]?.searchCalls, 0);
  assert.equal(result.cities[1]?.spots[0]?.name, "玉龙雪山");
  assert.deepEqual(result.pendingProvinces, ["四川省"]);
});

test("allows only one agent follow-up after the nominated spots are searched", async () => {
  const queries: string[] = [];
  const model = createMoonshotChatModel({
    apiKey: "test",
    baseUrl: "https://model.test/v1",
    model: "test",
    fetch: async (_url, init) => {
      const request = JSON.parse(String(init?.body)) as ChatRequest;
      if (schemaName(request) === "spot_nominations") {
        return chatResponse(request, { content: JSON.stringify({ spots: ["宽窄巷子", "武侯祠"] }) });
      }
      const tool = request.tools?.[0]?.function.name;
      assert.ok(tool);
      return chatResponse(request, { content: null,
        tool_calls: ["博物馆", "城市公园"].map((keywords, index) => ({
          index, id: "search-" + index, type: "function",
          function: { name: tool, arguments: JSON.stringify({ keywords }) },
        })) }, "tool_calls");
    },
  });
  const result = await runFirstRoundResearch({
    ...handoff,
    tripState: {
      ...handoff.tripState,
      destination: { state: "known", source: "user", areas: [
        { province: "四川省", places: [{ name: "成都市", spots: [] }] },
      ] },
    },
  }, {
    model: () => model,
    async search(query) {
      queries.push(query);
      return [];
    },
  });

  assert.deepEqual(queries, ["四川省 成都市 景点 宽窄巷子 武侯祠", "四川省 成都市 博物馆"]);
  assert.equal(result.cities[0].searchCalls, 2);
});

test("researches ten cities with their own deadlines and defers cities beyond the limit", async () => {
  const places = Array.from({ length: 11 }, (_, index) => ({ name: "城市" + (index + 1), spots: [] }));
  const signals = new Set<AbortSignal>();
  let active = 0;
  let peak = 0;
  const result = await runFirstRoundResearch({
    ...handoff,
    tripState: {
      ...handoff.tripState,
      destination: { state: "known", source: "user", areas: [{ province: "四川省", places }] },
    },
  }, {
    model() {
      throw new Error("Model unavailable");
    },
    async search(query, signal) {
      assert.ok(query.endsWith("旅游 景点 推荐"));
      signals.add(signal);
      active += 1;
      peak = Math.max(peak, active);
      await new Promise<void>((resolve) => setImmediate(resolve));
      active -= 1;
      throw new Error("Search unavailable");
    },
  });

  assert.equal(signals.size, 10);
  assert.equal(peak, 2);
  assert.deepEqual(result.cities.map(({ searchCalls }) => searchCalls), [...Array(10).fill(1), 0]);
  assert.equal(result.cities[10].status, "deferred");
});

test("an area the traveller named, such as 大理市, steers research instead of being searched as a spot", () => {
  const { tasks } = researchTasks({
    tripState: {
      name: { state: "missing" }, origin: { state: "missing" },
      destination: { state: "known", source: "user", areas: [{ province: "云南省", places: [
        { name: "大理白族自治州", spots: ["大理市", "崇圣寺三塔"] }] }] },
      startDate: { state: "missing" }, endDate: { state: "missing" },
      duration: { state: "known", value: "2天", source: "user" }, transportPreference: { state: "missing" },
    },
    referenceDate: "2026-11-15", timezone: "Asia/Shanghai", locale: "zh", preferences: [], preferenceStatus: "ready",
  });
  assert.deepEqual(tasks.map(({ city, requested, areas }) => [city, requested, areas]),
    [["大理白族自治州", ["崇圣寺三塔"], ["大理市"]]]);
});

test("a card whose quote names the prefecture stays, though the model wrote the county as its city (迪庆, 1.2015)", async () => {
  // From the live evaluation of 2026-11-16: every 迪庆 card came back with cityName 香格里拉 and was dropped.
  const diqing: PlanHandoff = { ...handoff, tripState: { ...handoff.tripState, destination: {
    state: "known", source: "user", areas: [{ province: "云南省", places: [{ name: "迪庆藏族自治州", spots: [] }] }],
  } } };
  const unknown = { opening: null, reservation: null, setting: null, walking: null, suggestedDuration: null };
  const location = (sourceId: number, quote: string) => ({ sourceId, quote, cityName: "香格里拉" });
  const model = createMoonshotChatModel({
    apiKey: "test",
    baseUrl: "https://model.test/v1",
    model: "test",
    fetch: async (_url, init) => {
      const request = JSON.parse(String(init?.body)) as ChatRequest;
      if (request.tools) return chatResponse(request, { content: "enough" });
      if (schemaName(request) === "spot_nominations") {
        return chatResponse(request, { content: JSON.stringify({ spots: ["独克宗古城", "松赞林寺", "梅里雪山"] }) });
      }
      return chatResponse(request, { content: JSON.stringify({ spots: [
        { name: "独克宗古城", location: location(1, "独克宗古城位于云南省迪庆藏族自治州香格里拉市"), ...unknown },
        { name: "松赞林寺", location: location(2, "松赞林寺位于迪庆州香格里拉市北郊"), ...unknown },
        // The quote names no city: the model's 香格里拉 alone is not enough.
        { name: "梅里雪山", location: location(3, "梅里雪山,并在附近饭店办理入住"), ...unknown },
      ] }) });
    },
  });
  const result = await runFirstRoundResearch(diqing, {
    model: () => model,
    async search() {
      return [
        { source: "example", title: "香格里拉市独克宗古城", snippet: "独克宗古城位于云南省迪庆藏族自治州香格里拉市，是茶马古道上的重镇",
          url: "https://example.com/dukezong" },
        { source: "example", title: "迪庆必去八大景点", snippet: "松赞林寺位于迪庆州香格里拉市北郊，被誉为小布达拉宫",
          url: "https://example.com/songzanlin" },
        { source: "example", title: "梅里雪山风景区", snippet: "梅里雪山,并在附近饭店办理入住", url: "https://example.com/meili" },
      ];
    },
  });

  const [city] = result.cities;
  assert.equal(city.status, "ready");
  assert.deepEqual(city.spots.map(({ name, location: evidence }) => [name, evidence?.url]), [
    ["独克宗古城", "https://example.com/dukezong"],
    ["松赞林寺", "https://example.com/songzanlin"],
  ]);
});

test("the agent may take its one follow-up to the second engine when the first results are thin (1.2113 step 1)", async () => {
  const asked: string[] = [];
  let toolNames: string[] = [];
  const model = createMoonshotChatModel({
    apiKey: "test", baseUrl: "https://model.test/v1", model: "test",
    fetch: async (_url, init) => {
      const request = JSON.parse(String(init?.body)) as ChatRequest;
      if (schemaName(request) === "spot_nominations") return chatResponse(request, { content: JSON.stringify({ spots: ["宽窄巷子"] }) });
      toolNames = request.tools?.map(({ function: { name } }) => name) ?? [];
      // Both tools at once: code still sends only the first, as the one follow-up.
      return chatResponse(request, { content: null, tool_calls: [
        { index: 0, id: "deep", type: "function", function: { name: "searchDeeper", arguments: JSON.stringify({ keywords: "宽窄巷子 开放时间" }) } },
        { index: 1, id: "plain", type: "function", function: { name: "search", arguments: JSON.stringify({ keywords: "博物馆" }) } },
      ] }, "tool_calls");
    },
  });
  const result = await runFirstRoundResearch({
    ...handoff,
    tripState: { ...handoff.tripState, destination: { state: "known", source: "user", areas: [{ province: "四川省", places: [{ name: "成都市", spots: [] }] }] } },
  }, {
    model: () => model,
    async search(query) { asked.push(`first:${query}`); return []; },
    async deepSearch(query) { asked.push(`deep:${query}`); return []; },
  });
  assert.deepEqual(toolNames.sort(), ["search", "searchDeeper"]);
  assert.deepEqual(asked, ["first:四川省 成都市 景点 宽窄巷子", "deep:四川省 成都市 宽窄巷子 开放时间"]);
  assert.equal(result.cities[0].searchCalls, 2);
});
