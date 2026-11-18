import assert from "node:assert/strict";
import test from "node:test";

import type { TrainOption, TransferLeg } from "@/domain/plan/transfer-legs";
import { createMoonshotChatModel } from "@/platform/llm/moonshot-chat-model";
import type { RailAnswer, TrainSearch } from "@/platform/rail/rail-12306";

import { flightCandidates, maxFlightSearches, maxTrainSearches, planTransport, trainCandidates, type TransportInput } from "./transport-agent";

type ChatRequest = {
  readonly messages: readonly { readonly role: string; readonly content: string | null }[];
  readonly response_format?: { readonly json_schema?: { readonly name?: string } };
  readonly tools?: readonly { readonly function: { readonly name: string } }[];
};

function reply(message: { content: string | null; tool_calls?: unknown }, finish = "stop"): Response {
  return Response.json({
    id: "chat-test", model: "test", created: 1,
    choices: [{ index: 0, message: { role: "assistant", ...message }, finish_reason: finish }],
    usage: { prompt_tokens: 50, completion_tokens: 10, total_tokens: 60 },
  });
}

/** A model that makes the given tool calls in one step, then picks with `pick`. */
function fakeModelCalling(calls: { tool: string; args: unknown }[], pick: unknown) {
  return () => createMoonshotChatModel({
    apiKey: "test", baseUrl: "https://model.test/v1", model: "test",
    fetch: async (_url, init) => {
      const request = JSON.parse(String(init?.body)) as ChatRequest;
      if (request.response_format?.json_schema?.name === "transport_pick") return reply({ content: JSON.stringify(pick) });
      if (request.messages.some(({ role }) => role === "tool")) return reply({ content: "done" });
      return reply({ content: null, tool_calls: calls.map(({ tool, args }, index) => ({
        index, id: `call-${index}`, type: "function", function: { name: tool, arguments: JSON.stringify(args) },
      })) }, "tool_calls");
    },
  });
}

/** A model that searches the given legs once, then picks with `pick`; or fails when `failing`. */
function fakeModel(searchLegs: number[], pick: unknown, failing = false) {
  return () => createMoonshotChatModel({
    apiKey: "test", baseUrl: "https://model.test/v1", model: "test",
    fetch: async (_url, init) => {
      if (failing) return new Response("unavailable", { status: 503 });
      const request = JSON.parse(String(init?.body)) as ChatRequest;
      if (request.response_format?.json_schema?.name === "transport_pick") return reply({ content: JSON.stringify(pick) });
      // After the tool results come back, the agent is done.
      if (request.messages.some(({ role }) => role === "tool")) return reply({ content: "done" });
      const tool = request.tools?.[0]?.function.name ?? "searchTrains";
      return reply({ content: null, tool_calls: searchLegs.map((leg, index) => ({
        index, id: `call-${index}`, type: "function", function: { name: tool, arguments: JSON.stringify({ leg }) },
      })) }, "tool_calls");
    },
  });
}

const train = (code: string, departs: string, minutes: number): TrainOption => ({
  code, from: "丽江", to: "大理", departs, arrives: "14:22", arriveDayOffset: 0, durationMinutes: minutes,
  seats: [{ name: "二等座", price: 80, left: "有" }],
});
const drive = (minutes: number) => ({ status: "estimated" as const, distanceKm: 186, durationMinutes: minutes, path: [[1, 1], [2, 2]] as [number, number][] });
const legs: TransferLeg[] = [
  { kind: "outbound", day: 1, from: "上海虹桥站", to: "丽江市", estimate: drive(2280) },
  { kind: "between", day: 3, from: "丽江市", to: "大理白族自治州", estimate: drive(170) },
  { kind: "return", day: 5, from: "大理白族自治州", to: "上海虹桥站", estimate: drive(2230) },
];
const input = (overrides: Partial<TransportInput> = {}): TransportInput => ({
  choice: "train",
  dates: new Map([[1, "2026-11-20"], [3, "2026-11-22"], [5, "2026-11-24"]]),
  originRailCity: "上海", preferences: [], locale: "zh", ...overrides,
});

function rail(answers: (search: TrainSearch) => RailAnswer) {
  const asked: TrainSearch[] = [];
  return { asked, searchTrains: async (search: TrainSearch) => { asked.push(search); return answers(search); } };
}
const found = (...options: TrainOption[]): RailAnswer =>
  ({ status: "found", trains: { queriedDate: "2026-11-22", reference: false, checkedAt: "2026-11-17T08:00:00.000Z", options } });

test("code decides which legs may be trains: a self-driver none, a flight choice only between cities (1.2108)", () => {
  assert.deepEqual(trainCandidates(legs, input()).map(({ leg, fromCity, toCity, window, bound }) => [leg.kind, fromCity, toCity, window, bound]), [
    ["outbound", "上海", "丽江", [0, 24], true],
    ["between", "丽江", "大理", [6, 13], false],
    ["return", "大理", "上海", [12, 24], true],
  ]);
  assert.deepEqual(trainCandidates(legs, input({ choice: "drive" })), []);
  assert.deepEqual(trainCandidates(legs, input({ choice: "flight" })).map(({ leg }) => leg.kind), ["between"]);
  // Without dates nothing can be asked.
  assert.deepEqual(trainCandidates(legs, input({ dates: new Map() })), []);
});

test("the agent searches; a pick that names a listed train is kept with its reason, and options are capped", async () => {
  const { asked, searchTrains } = rail(() => found(train("C378", "12:00", 142), train("D8761", "08:30", 128), train("K9", "07:00", 300), train("C1", "09:00", 150)));
  const outcome = await planTransport(legs, input({ choice: "auto" }), {
    searchTrains,
    model: fakeModel([1], { legs: [{ leg: 1, mode: "train", trainCode: "C378", reason: "中午出发，下午到大理" }] }),
  });
  assert.deepEqual(asked.map(({ fromCity, toCity, date, earliestHour, latestHour }) => [fromCity, toCity, date, earliestHour, latestHour]),
    [["丽江", "大理", "2026-11-22", 6, 13]]);
  const between = outcome.legs[1];
  assert.deepEqual(between.recommendation, { mode: "train", trainCode: "C378", flightNo: null, reason: "中午出发，下午到大理", by: "agent" });
  // The pick first, then the quickest, at most three.
  assert.deepEqual(between.trains?.options.map(({ code }) => code), ["C378", "D8761", "C1"]);
  assert.equal(outcome.searches, 1);
  // Legs it did not search keep their drive estimate and nothing more.
  assert.equal(outcome.legs[0].trains, undefined);
});

test("a train the model made up is refused: code picks the quickest real one", async () => {
  const { searchTrains } = rail(() => found(train("C378", "12:00", 142), train("D8761", "08:30", 128)));
  const outcome = await planTransport(legs, input(), {
    searchTrains,
    model: fakeModel([0, 1, 2], { legs: [{ leg: 0, mode: "train", trainCode: "G9999", reason: "最快" }, { leg: 1, mode: "drive", trainCode: null, reason: "开车更灵活" }] }),
  });
  assert.deepEqual(outcome.legs[0].recommendation, { mode: "train", trainCode: "D8761", flightNo: null, reason: "按你选的高铁，选了用时最短的一趟", by: "code" });
  // Between cities the model may choose to drive.
  assert.deepEqual(outcome.legs[1].recommendation, { mode: "drive", trainCode: null, flightNo: null, reason: "开车更灵活", by: "agent" });
  // A leg with no pick still gets code's choice.
  assert.equal(outcome.legs[2].recommendation?.by, "code");
});

test("a model that cannot be reached leaves every leg as it was", async () => {
  const { asked, searchTrains } = rail(() => found(train("C378", "12:00", 142)));
  const outcome = await planTransport(legs, input(), { searchTrains, model: fakeModel([], null, true) });
  assert.deepEqual(asked, []);
  assert.deepEqual(outcome.legs, legs);
});

test("searches stop at the budget, and the same search is not sent twice", async () => {
  const { asked, searchTrains } = rail(() => ({ status: "none", queriedDate: "2026-11-22", reference: false }));
  const many: TransferLeg[] = Array.from({ length: 9 }, (_, index) =>
    ({ kind: "between", day: index + 2, from: `城${index}`, to: `城${index + 1}`, estimate: drive(100) }));
  const outcome = await planTransport(many, input({ dates: new Map(many.map(({ day }) => [day, "2026-11-22"])) }), {
    searchTrains, model: fakeModel([0, 0, 1, 2, 3, 4, 5, 6, 7, 8], { legs: [] }),
  });
  assert.equal(outcome.searches, maxTrainSearches);
  assert.equal(asked.length, maxTrainSearches);
  assert.ok(outcome.legs.every(({ trains }) => trains === undefined));
  // The searched legs say no train was found; the rest were not searched and say nothing.
  assert.equal(outcome.legs.filter(({ trainsMissing }) => trainsMissing === "none").length, maxTrainSearches);
});

test("with no direct train the agent may choose a change city; code joins the two halves (1.2110)", async () => {
  const toKunming = { ...train("Z162", "17:38", 1712), from: "上海南", to: "昆明", arrives: "22:10", arriveDayOffset: 1 };
  const toLijiang = { ...train("D8761", "23:40", 200), from: "昆明", to: "丽江", arrives: "03:00", arriveDayOffset: 1 };
  const { asked, searchTrains } = rail((search) => {
    if (search.toCity === "丽江" && search.fromCity === "上海") return { status: "none", queriedDate: search.date, reference: false };
    if (search.toCity === "昆明") return { status: "found", trains: { queriedDate: "2026-11-20", reference: false, checkedAt: "2026-11-17T08:00:00.000Z", options: [toKunming] } };
    return { status: "found", trains: { queriedDate: search.date, reference: false, checkedAt: "2026-11-17T08:00:00.000Z", options: [toLijiang] } };
  });
  const outcome = await planTransport([legs[0]], input(), {
    searchTrains,
    model: fakeModelCalling([
      { tool: "searchTrains", args: { leg: 0 } },
      { tool: "searchConnection", args: { leg: 0, via: "昆明市" } },
    ], { legs: [{ leg: 0, mode: "train", trainCode: "Z162/D8761", reason: "在昆明换乘" }] }),
  });
  // Direct first, then the two halves: the second asked on the day the first arrives in 昆明.
  assert.deepEqual(asked.map(({ fromCity, toCity, date }) => `${fromCity}>${toCity} ${date}`),
    ["上海>丽江 2026-11-20", "上海>昆明 2026-11-20", "昆明>丽江 2026-11-21"]);
  const journey = outcome.legs[0].trains?.options[0];
  assert.equal(journey?.code, "Z162/D8761");
  assert.equal(journey?.change?.city, "昆明");
  assert.equal(journey?.change?.waitMinutes, 90);
  assert.deepEqual(outcome.legs[0].recommendation, { mode: "train", trainCode: "Z162/D8761", flightNo: null, reason: "在昆明换乘", by: "agent" });
});

test("a connection is refused before the direct search, or when a direct train exists", async () => {
  const { asked, searchTrains } = rail(() => found(train("C378", "12:00", 142)));
  await planTransport([legs[1]], input({ choice: "auto" }), {
    searchTrains,
    model: fakeModelCalling([{ tool: "searchConnection", args: { leg: 0, via: "昆明" } }, { tool: "searchTrains", args: { leg: 0 } },
      { tool: "searchConnection", args: { leg: 0, via: "昆明" } }], { legs: [] }),
  });
  // Only the direct search went out.
  assert.deepEqual(asked.map(({ toCity }) => toCity), ["大理"]);
});

const flight = (flightNo: string, departs: string, minutes: number, price: number) => ({
  flightNo, fromAirport: "上海浦东", toAirport: "丽江三义", departs, arrives: "13:45", arriveDayOffset: 0, durationMinutes: minutes,
  cabin: "经济舱", price, seatsLeft: 9, charges: 190, stopCity: null, codeshare: false,
});
const flightsFound = (...options: ReturnType<typeof flight>[]) =>
  ({ status: "found" as const, flights: { queriedDate: "2026-11-20", checkedAt: "2026-11-18T06:30:00.000Z", options } });

test("code decides which legs may fly: ends for a flight or let-Meri-decide choice, between cities only for a long drive (1.2111)", () => {
  assert.deepEqual(flightCandidates(legs, input({ choice: "flight" })).map(({ leg, bound }) => [leg.kind, bound]), [["outbound", true], ["return", true]]);
  assert.deepEqual(flightCandidates(legs, input({ choice: "auto" })).map(({ leg, bound }) => [leg.kind, bound]), [["outbound", false], ["return", false]]);
  assert.deepEqual(flightCandidates(legs, input({ choice: "train" })), []);
  assert.deepEqual(flightCandidates(legs, input({ choice: "drive" })), []);
  const long: TransferLeg = { kind: "between", day: 3, from: "丽江市", to: "西双版纳傣族自治州", estimate: drive(600) };
  assert.deepEqual(flightCandidates([long], input({ choice: "train" })).map(({ toCity }) => toCity), ["西双版纳"]);
});

test("the agent gives city codes; flights for a flight choice are kept, a made-up one refused (1.2111)", async () => {
  const flightSearches: string[] = [];
  const outcome = await planTransport([legs[0]], input({ choice: "flight" }), {
    searchTrains: async () => { throw new Error("no train search expected"); },
    searchFlights: async (search) => {
      flightSearches.push(`${search.fromCode}>${search.toCode} ${search.fromCity}>${search.toCity} ${search.date}`);
      return flightsFound(flight("9C6733", "09:30", 255, 460), flight("CA8559", "07:55", 235, 670));
    },
    model: fakeModelCalling([{ tool: "searchFlights", args: { leg: 0, fromCode: "sha", toCode: "LJG" } }],
      { legs: [{ leg: 0, mode: "flight", trainCode: null, flightNo: "MU9999", reason: "最便宜" }] }),
  });
  assert.deepEqual(flightSearches, ["SHA>LJG 上海>丽江 2026-11-20"]);
  // MU9999 was not found: code picks the quickest real flight, as the traveller chose to fly.
  assert.deepEqual(outcome.legs[0].recommendation,
    { mode: "flight", trainCode: null, flightNo: "CA8559", reason: "按你选的飞机，选了用时最短的一班", by: "code" });
  assert.deepEqual(outcome.legs[0].flights?.options.map(({ flightNo }) => flightNo), ["CA8559", "9C6733"]);
  assert.equal(outcome.flightSearches, 1);
});

test("letting Meri decide, the agent may pick the flight over a day on the train", async () => {
  const outcome = await planTransport([legs[0]], input({ choice: "auto" }), {
    searchTrains: async () => found({ ...train("Z162", "17:38", 1712), from: "上海南", to: "丽江" }),
    searchFlights: async () => flightsFound(flight("9C6733", "09:30", 255, 460)),
    model: fakeModelCalling([{ tool: "searchTrains", args: { leg: 0 } }, { tool: "searchFlights", args: { leg: 0, fromCode: "SHA", toCode: "LJG" } }],
      { legs: [{ leg: 0, mode: "flight", trainCode: null, flightNo: "9C6733", reason: "4 小时 15 分、¥460，比火车快一天" }] }),
  });
  const leg = outcome.legs[0];
  assert.deepEqual(leg.recommendation, { mode: "flight", trainCode: null, flightNo: "9C6733", reason: "4 小时 15 分、¥460，比火车快一天", by: "agent" });
  // Both are kept, so the card can compare them.
  assert.equal(leg.trains?.options[0]?.code, "Z162");
  assert.equal(leg.flights?.options[0]?.flightNo, "9C6733");
});

test("flight searches stop at their budget, and a flight with nothing found says so", async () => {
  let asked = 0;
  const many: TransferLeg[] = Array.from({ length: 6 }, (_, index) =>
    ({ kind: "between", day: index + 2, from: `城${index}`, to: `城${index + 1}`, estimate: drive(700) }));
  const outcome = await planTransport(many, input({ choice: "auto", dates: new Map(many.map(({ day }) => [day, "2026-11-22"])) }), {
    searchTrains: async () => ({ status: "none", queriedDate: "2026-11-22", reference: false }),
    searchFlights: async () => { asked += 1; return { status: "none" }; },
    model: fakeModelCalling(many.map((_, leg) => ({ tool: "searchFlights", args: { leg, fromCode: "AAA", toCode: "BBB" } })), { legs: [] }),
  });
  assert.equal(asked, maxFlightSearches);
  assert.equal(outcome.legs.filter(({ flightsMissing }) => flightsMissing === "none").length, maxFlightSearches);
});
