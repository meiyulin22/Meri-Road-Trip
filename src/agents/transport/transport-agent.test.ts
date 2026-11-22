import assert from "node:assert/strict";
import test from "node:test";

import type { TrainOption, TransferLeg } from "@/domain/plan/transfer-legs";
import { createMoonshotChatModel } from "@/platform/llm/moonshot-chat-model";
import type { RailAnswer, TrainSearch } from "@/platform/rail/rail-12306";

import { applyTransport, flightCandidates, maxVariflightFen, maxTrainSearches, planTransport, trainCandidates, type TransportInput } from "./transport-agent";

type ChatRequest = {
  readonly messages: readonly { readonly role: string; readonly content: string | null; readonly tool_calls?: unknown }[];
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
  originRailCity: "上海", preferences: [], locale: "zh", allowQuestion: false, ...overrides,
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
  const many: TransferLeg[] = Array.from({ length: 9 }, (_, index) =>
    ({ kind: "between", day: index + 2, from: `城${index}`, to: `城${index + 1}`, estimate: drive(700) }));
  const outcome = await planTransport(many, input({ choice: "auto", dates: new Map(many.map(({ day }) => [day, "2026-11-22"])) }), {
    searchTrains: async () => ({ status: "none", queriedDate: "2026-11-22", reference: false }),
    searchFlights: async () => { asked += 1; return { status: "none" }; },
    model: fakeModelCalling(many.map((_, leg) => ({ tool: "searchFlights", args: { leg, fromCode: "AAA", toCode: "BBB" } })), { legs: [] }),
  });
  // ¥2 at ¥0.25 a search: eight of the nine legs, and the run says what it spent.
  assert.equal(asked, maxVariflightFen / 25);
  assert.equal(outcome.variflightFen, maxVariflightFen);
  assert.equal(outcome.legs.filter(({ flightsMissing }) => flightsMissing === "none").length, maxVariflightFen / 25);
});

/**
 * A model that makes each step's tool calls after the previous step's results came back, then
 * picks with `pick`; `prompts` collects what the pick call was shown.
 */
function fakeModelSteps(steps: { tool: string; args: unknown }[][], pick: unknown, prompts: string[] = []) {
  return () => createMoonshotChatModel({
    apiKey: "test", baseUrl: "https://model.test/v1", model: "test",
    fetch: async (_url, init) => {
      const request = JSON.parse(String(init?.body)) as ChatRequest;
      if (request.response_format?.json_schema?.name === "transport_pick") {
        prompts.push(String(request.messages.at(-1)?.content));
        return reply({ content: JSON.stringify(pick) });
      }
      const step = request.messages.filter(({ role, tool_calls: calls }) => role === "assistant" && calls).length;
      const calls = steps[step];
      if (!calls) return reply({ content: "done" });
      return reply({ content: null, tool_calls: calls.map(({ tool, args }, index) => ({
        index, id: `call-${step}-${index}`, type: "function", function: { name: tool, arguments: JSON.stringify(args) },
      })) }, "tool_calls");
    },
  });
}

// Setting off and heading home of a trip by train, 上海 ⇄ 丽江: a day on the train each way.
const ends = [legs[0], legs[2]];
const sleeper = { ...train("Z162", "17:38", 1712), from: "上海南", to: "丽江" };
const searchBoth = [
  [{ tool: "searchTrains", args: { leg: 0 } }, { tool: "searchTrains", args: { leg: 1 } }],
  [{ tool: "searchFlights", args: { leg: 0, fromCode: "SHA", toCode: "LJG" } }, { tool: "searchFlights", args: { leg: 1, fromCode: "LJG", toCode: "SHA" } }],
];
function providers(trainMinutes = 1712) {
  const flightsAsked: string[] = [];
  return {
    flightsAsked,
    searchTrains: async () => found({ ...sleeper, durationMinutes: trainMinutes }),
    searchFlights: async (search: { fromCode: string; toCode: string }) => {
      flightsAsked.push(`${search.fromCode}>${search.toCode}`);
      return flightsFound(flight("9C6733", "09:30", 255, 460), flight("CA8559", "07:55", 235, 670));
    },
  };
}
const pickFlights = (askTraveller: boolean | null, legsAsked = [0, 1]) => ({ legs: legsAsked.map((leg) => (
  { leg, mode: "flight", trainCode: null, flightNo: "9C6733", reason: "比火车快一天", askTraveller }
)) });

test("a train over 12 hours with a flight found: code asks once about both ends, even when the agent would not (1.2112)", async () => {
  const prompts: string[] = [];
  const { flightsAsked, ...search } = providers();
  const outcome = await planTransport(ends, input({ allowQuestion: true }), { ...search, model: fakeModelSteps(searchBoth, pickFlights(false), prompts) });
  // The traveller chose the train, yet the comparison flights were searched, one per end.
  assert.deepEqual(flightsAsked, ["SHA>LJG", "LJG>SHA"]);
  // The pick saw both ends as askable, not bound to the train.
  const shown = JSON.parse(prompts[0]) as { legs: { askable?: boolean; boundTo: string | null }[] };
  assert.deepEqual(shown.legs.map(({ askable, boundTo }) => [askable, boundTo]), [[true, null], [true, null]]);
  // No preference mentions trains or flying, so code asks although the agent said no.
  assert.deepEqual(outcome.question?.askedLegs, [0, 1]);
  assert.match(outcome.question?.question.text ?? "", /^去程火车最快28小时32分（Z162），飞机 CA8559 约3小时55分、¥670；回程/u);
  // Until answered, the legs read as if the train were kept.
  assert.deepEqual(outcome.legs[0].recommendation, { mode: "train", trainCode: "Z162", flightNo: null, reason: "按你选的高铁，选了用时最短的一趟", by: "code" });
});

test("each answer decides the asked legs again from the same findings, with no new search", async () => {
  const outcome = await planTransport(ends, input({ allowQuestion: true }), { ...providers(), model: fakeModelSteps(searchBoth, pickFlights(true)) });
  const pause = outcome.question;
  assert.ok(pause);
  const decide = (choice: "train" | "flight" | "auto") =>
    applyTransport(ends, pause.findings, "zh", { legs: pause.askedLegs, choice }).map(({ recommendation }) => recommendation);
  // Fly instead: the agent's flight, with its reason.
  assert.deepEqual(decide("flight")[0], { mode: "flight", trainCode: null, flightNo: "9C6733", reason: "比火车快一天", by: "agent" });
  // Stay on the train: the agent picked a flight, so code keeps the quickest train and says why.
  assert.deepEqual(decide("train")[1], { mode: "train", trainCode: "Z162", flightNo: null, reason: "你选了坚持坐火车，这是用时最短的一趟", by: "code" });
  // You decide: the agent's pick as it is.
  assert.equal(decide("auto")[0]?.flightNo, "9C6733");
  // Answering fly with no usable pick: the quickest flight, said to be the traveller's choice.
  const noPick = { legs: pause.findings.legs.map((leg) => ({ ...leg, pick: null })) };
  assert.deepEqual(applyTransport(ends, noPick, "zh", { legs: [0], choice: "flight" })[0].recommendation,
    { mode: "flight", trainCode: null, flightNo: "CA8559", reason: "你选了改坐飞机，这是用时最短的一班", by: "code" });
  // You decide with no pick: a flight beats more than 12 hours on the train.
  assert.equal(applyTransport(ends, noPick, "zh", { legs: [0], choice: "auto" })[0].recommendation?.mode, "flight");
});

test("a preference about the train lets the agent decide: no question when it says so, one leg when it asks one", async () => {
  const quiet = await planTransport(ends, input({ allowQuestion: true, preferences: ["想坐一次卧铺"] }), {
    ...providers(), model: fakeModelSteps(searchBoth, pickFlights(false)),
  });
  assert.equal(quiet.question, null);
  // The train stays, and the flight found is still shown next to it.
  assert.equal(quiet.legs[0].recommendation?.mode, "train");
  assert.equal(quiet.legs[0].flights?.options[0]?.flightNo, "CA8559");

  const one = await planTransport(ends, input({ allowQuestion: true, preferences: ["想坐一次卧铺"] }), {
    ...providers(), model: fakeModelSteps(searchBoth, { legs: [pickFlights(true).legs[0], pickFlights(false).legs[1]] }),
  });
  assert.deepEqual(one.question?.askedLegs, [0]);
  assert.match(one.question?.question.text ?? "", /^去程/u);
});

test("a comparison flight is searched only after the train, and only when the train is over 12 hours", async () => {
  // Flights first: refused until the trains are known.
  const early = providers();
  await planTransport([legs[0]], input({ allowQuestion: true }), { ...early, model: fakeModelSteps([
    [{ tool: "searchFlights", args: { leg: 0, fromCode: "SHA", toCode: "LJG" } }],
  ], { legs: [] }) });
  assert.deepEqual(early.flightsAsked, []);
  // Ten hours on the train: no flight is bought and nothing is asked.
  const quick = providers(600);
  const outcome = await planTransport([legs[0]], input({ allowQuestion: true }), { ...quick, model: fakeModelSteps(searchBoth, { legs: [] }) });
  assert.deepEqual(quick.flightsAsked, []);
  assert.equal(outcome.question, null);
});

test("where a run cannot ask, a train choice searches no flight, as before (1.2112)", async () => {
  const { flightsAsked, ...search } = providers();
  const outcome = await planTransport(ends, input(), { ...search, model: fakeModelSteps(searchBoth, pickFlights(true)) });
  assert.deepEqual(flightsAsked, []);
  assert.equal(outcome.question, null);
  assert.equal(outcome.legs[0].recommendation?.mode, "train");
});

test("no train at all: the comparison flight is used without a question, and the card says why", async () => {
  const flightsAsked: string[] = [];
  const outcome = await planTransport([legs[0]], input({ allowQuestion: true }), {
    searchTrains: async (search) => ({ status: "none", queriedDate: search.date, reference: false }),
    searchFlights: async () => { flightsAsked.push("SHA>LJG"); return flightsFound(flight("CA8559", "07:55", 235, 670)); },
    model: fakeModelSteps(searchBoth, { legs: [] }),
  });
  assert.deepEqual(flightsAsked, ["SHA>LJG"]);
  assert.equal(outcome.question, null);
  assert.equal(outcome.legs[0].trainsMissing, "none");
  assert.deepEqual(outcome.legs[0].recommendation,
    { mode: "flight", trainCode: null, flightNo: "CA8559", reason: "没查到火车，这是用时最短的一班飞机", by: "code" });
});

test("a flight choice with no flight falls back to the train, searched only after the flights (2026-11-22)", async () => {
  const trainsAsked: string[] = [];
  const flightsFirst = [
    [{ tool: "searchTrains", args: { leg: 0 } }],
    [{ tool: "searchFlights", args: { leg: 0, fromCode: "SHA", toCode: "LJG" } }],
    [{ tool: "searchTrains", args: { leg: 0 } }],
  ];
  const outcome = await planTransport([legs[0]], input({ choice: "flight" }), {
    searchTrains: async (search) => { trainsAsked.push(search.date); return found({ ...sleeper, durationMinutes: 1712 }); },
    searchFlights: async () => ({ status: "none" }),
    model: fakeModelSteps(flightsFirst, { legs: [] }),
  });
  // The first train search, before any flight, was refused; the one after "no flight" was made.
  assert.equal(trainsAsked.length, 1);
  assert.equal(outcome.legs[0].flightsMissing, "none");
  assert.equal(outcome.legs[0].recommendation?.mode, "train");
  assert.equal(outcome.legs[0].recommendation?.reason, "没查到航班，这是用时最短的一趟火车");

  // A flight found: no train is searched for that leg.
  const flown: string[] = [];
  await planTransport([legs[0]], input({ choice: "flight" }), {
    searchTrains: async (search) => { flown.push(search.date); return found(sleeper); },
    searchFlights: async () => flightsFound(flight("CA8559", "07:55", 235, 670)),
    model: fakeModelSteps(flightsFirst.slice(1), { legs: [] }),
  });
  assert.deepEqual(flown, []);
});

// Changing planes (1.2113): 上海 → 迪庆 has no direct flight; VariFlight's recorded connection is via 成都.
const toDiqing: TransferLeg = { kind: "outbound", day: 1, from: "上海虹桥站", to: "迪庆藏族自治州", estimate: drive(2900) };
const mu9181 = { ...flight("MU9181", "12:30", 190, 980), fromAirport: "上海虹桥", toAirport: "成都天府", arrives: "15:40" };
const mu5780 = { ...flight("MU5780", "17:30", 90, 650), fromAirport: "成都天府", toAirport: "迪庆香格里拉", arrives: "19:00" };
function airline(direct: ReturnType<typeof flight>[] = []) {
  const asked: string[] = [];
  return {
    asked,
    searchTrains: async () => ({ status: "none" as const, queriedDate: "2026-12-21", reference: false }),
    searchFlights: async (search: { fromCode: string; toCode: string; date: string }) => {
      asked.push(`${search.fromCode}>${search.toCode} ${search.date}`);
      const route = `${search.fromCode}>${search.toCode}`;
      if (route === "SHA>DIG") return direct.length > 0 ? flightsFound(...direct) : { status: "none" as const };
      if (route === "SHA>CTU") return flightsFound(mu9181);
      if (route === "CTU>DIG") return flightsFound(mu5780);
      return { status: "none" as const };
    },
  };
}
const diqingInput = input({ choice: "flight", dates: new Map([[1, "2026-12-21"]]) });

test("with no direct flight the agent names a change city; code joins two fare searches (1.2113)", async () => {
  const { asked, ...providers } = airline();
  const outcome = await planTransport([toDiqing], diqingInput, { ...providers, model: fakeModelSteps([
    [{ tool: "searchFlights", args: { leg: 0, fromCode: "SHA", toCode: "DIG" } }],
    [{ tool: "searchFlightConnection", args: { leg: 0, viaCode: "ctu", viaCity: "成都市" } }],
  ], { legs: [{ leg: 0, mode: "flight", trainCode: null, flightNo: "MU9181/MU5780", reason: "经成都转机，当天 19:00 到" }] }) });
  assert.deepEqual(asked, ["SHA>DIG 2026-12-21", "SHA>CTU 2026-12-21", "CTU>DIG 2026-12-21"]);
  const leg = outcome.legs[0];
  assert.deepEqual(leg.recommendation, { mode: "flight", trainCode: null, flightNo: "MU9181/MU5780", reason: "经成都转机，当天 19:00 到", by: "agent" });
  const journey = leg.flights?.options[0];
  assert.deepEqual(journey && [journey.price, journey.change?.city, journey.change?.waitMinutes, journey.change?.sameAirport], [1630, "成都", 110, true]);
  // Three fare searches at ¥0.25; the direct search's "none" no longer shows once a connection is found.
  assert.equal(outcome.variflightFen, 75);
  assert.equal(leg.flightsMissing, undefined);
});

test("a change of plane is refused before the direct search, and when a direct flight exists", async () => {
  const early = airline();
  await planTransport([toDiqing], diqingInput, { ...early, model: fakeModelSteps([
    [{ tool: "searchFlightConnection", args: { leg: 0, viaCode: "CTU", viaCity: "成都" } }],
  ], { legs: [] }) });
  assert.deepEqual(early.asked, []);
  const direct = airline([flight("MU1", "08:00", 240, 900)]);
  await planTransport([toDiqing], diqingInput, { ...direct, model: fakeModelSteps([
    [{ tool: "searchFlights", args: { leg: 0, fromCode: "SHA", toCode: "DIG" } }],
    [{ tool: "searchFlightConnection", args: { leg: 0, viaCode: "CTU", viaCity: "成都" } }],
  ], { legs: [] }) });
  assert.deepEqual(direct.asked, ["SHA>DIG 2026-12-21"]);
});

test("when its own hub does not join, the agent may ask VariFlight's change cities and try one", async () => {
  const { asked, ...providers } = airline();
  const hubsAsked: string[] = [];
  const outcome = await planTransport([toDiqing], diqingInput, {
    ...providers,
    flightHubs: async (search) => { hubsAsked.push(`${search.fromCode}>${search.toCode}`); return { status: "found", hubs: [{ code: "CTU", city: "成都" }] }; },
    model: fakeModelSteps([
      [{ tool: "searchFlights", args: { leg: 0, fromCode: "SHA", toCode: "DIG" } }],
      [{ tool: "searchFlightConnection", args: { leg: 0, viaCode: "KMG", viaCity: "昆明" } }],
      [{ tool: "suggestFlightHubs", args: { leg: 0 } }],
      [{ tool: "searchFlightConnection", args: { leg: 0, viaCode: "CTU", viaCity: "成都" } }],
    ], { legs: [] }),
  });
  assert.deepEqual(hubsAsked, ["SHA>DIG"]);
  assert.deepEqual(asked, ["SHA>DIG 2026-12-21", "SHA>KMG 2026-12-21", "SHA>CTU 2026-12-21", "CTU>DIG 2026-12-21"]);
  // No pick: the traveller chose to fly, so code takes the quickest flight found, the connection.
  assert.equal(outcome.legs[0].recommendation?.flightNo, "MU9181/MU5780");
  assert.equal(outcome.variflightFen, 125);
});

test("a change of plane that would pass the run's ¥2 is refused before any search", async () => {
  const many: TransferLeg[] = Array.from({ length: 7 }, (_, index) =>
    ({ kind: "between", day: index + 2, from: `城${index}`, to: `城${index + 1}`, estimate: drive(700) }));
  let asked = 0;
  const outcome = await planTransport([...many, { ...toDiqing, kind: "return", day: 9 }], input({ choice: "auto", dates: new Map([...many.map(({ day }) => [day, "2026-12-21"] as const), [9, "2026-12-21"]]) }), {
    searchTrains: async () => ({ status: "none", queriedDate: "2026-12-21", reference: false }),
    searchFlights: async () => { asked += 1; return { status: "none" }; },
    model: fakeModelSteps([
      many.map((_, leg) => ({ tool: "searchFlights", args: { leg, fromCode: "AAA", toCode: "BBB" } })),
      [{ tool: "searchFlightConnection", args: { leg: 0, viaCode: "CTU", viaCity: "成都" } }],
    ], { legs: [] }),
  });
  // Seven searches spent ¥1.75; a change of plane needs ¥0.50.
  assert.equal(asked, 7);
  assert.equal(outcome.variflightFen, 175);
});

test("with train and flight search switched off, the agent is not run and the bound legs say so (1.2113 step 1)", async () => {
  const noModel = () => { throw new Error("no transport model expected"); };
  const byTrain = await planTransport(legs, input(), { model: noModel });
  assert.deepEqual(byTrain.legs.map(({ trainsMissing, flightsMissing }) => [trainsMissing, flightsMissing]),
    [["off", undefined], [undefined, undefined], ["off", undefined]]);
  assert.equal(byTrain.searches, 0);
  const byAir = await planTransport(legs, input({ choice: "flight" }), { model: noModel });
  assert.deepEqual(byAir.legs.map(({ flightsMissing }) => flightsMissing), ["off", undefined, "off"]);
  // Letting Meri decide binds nothing, so nothing is said to be off.
  const open = await planTransport(legs, input({ choice: "auto" }), { model: noModel });
  assert.ok(open.legs.every(({ trainsMissing, flightsMissing }) => trainsMissing === undefined && flightsMissing === undefined));
});

// Flying near, then the train on (1.2114): 北京 → 婺源 has no airport; fly to 景德镇 and take the train.
const toWuyuan: TransferLeg = { kind: "outbound", day: 1, from: "北京", to: "婺源", estimate: drive(900) };
const landing = { ...flight("MU5122", "08:00", 140, 600), fromAirport: "北京首都", toAirport: "景德镇罗家", arrives: "10:20" };
const onward = { ...train("G1234", "12:40", 30), from: "景德镇北", to: "婺源" };
function nearAirport() {
  const flightsAsked: string[] = [];
  const trainsAsked: string[] = [];
  return {
    flightsAsked, trainsAsked,
    searchFlights: async (search: { fromCode: string; toCode: string }) => {
      flightsAsked.push(`${search.fromCode}>${search.toCode}`);
      return search.toCode === "JDZ" ? flightsFound(landing) : { status: "none" as const };
    },
    searchTrains: async (search: TrainSearch) => {
      trainsAsked.push(`${search.fromCity}>${search.toCity}`);
      return search.fromCity === "景德镇" ? onDay(search, onward) : { status: "none" as const, queriedDate: search.date, reference: false };
    },
  };
}
/** Trains found on the day asked, as 12306 answers inside its presale window. */
const onDay = (search: TrainSearch, ...options: TrainOption[]): RailAnswer =>
  ({ status: "found", trains: { queriedDate: search.date, reference: false, checkedAt: "2026-11-18T08:00:00.000Z", options } });
const wuyuanInput = input({ choice: "auto", originRailCity: "北京", dates: new Map([[1, "2026-11-20"]]) });

test("where the end has no airport, the agent flies to a city near it and code joins the train on (1.2114)", async () => {
  const { flightsAsked, trainsAsked, ...providers } = nearAirport();
  const outcome = await planTransport([toWuyuan], wuyuanInput, { ...providers, model: fakeModelSteps([
    [{ tool: "searchTrains", args: { leg: 0 } }, { tool: "searchFlights", args: { leg: 0, fromCode: "BJS", toCode: "WUY" } }],
    [{ tool: "searchAirRail", args: { leg: 0, fromCode: "BJS", viaCode: "JDZ", viaCity: "景德镇市" } }],
  ], { legs: [] }) });
  assert.deepEqual(flightsAsked, ["BJS>WUY", "BJS>JDZ"]);
  assert.deepEqual(trainsAsked, ["北京>婺源", "景德镇>婺源"]);
  // No pick, no direct train or flight: code takes the flight-then-train journey and says why.
  const leg = outcome.legs[0];
  assert.deepEqual(leg.recommendation, { mode: "air_rail", trainCode: null, flightNo: null, airRailCode: "MU5122/G1234", by: "code",
    reason: "没有直飞，这是用时最短的飞机转火车（经景德镇）" });
  assert.deepEqual(leg.airRail?.options.map(({ code, waitMinutes, price }) => [code, waitMinutes, price]), [["MU5122/G1234", 140, 680]]);
  assert.equal(outcome.variflightFen, 50);
});

test("flying near is refused before the flight search, and is not offered without trains", async () => {
  const early = nearAirport();
  await planTransport([toWuyuan], wuyuanInput, { ...early, model: fakeModelSteps([
    [{ tool: "searchAirRail", args: { leg: 0, fromCode: "BJS", viaCode: "JDZ", viaCity: "景德镇" } }],
  ], { legs: [] }) });
  assert.deepEqual(early.flightsAsked, []);
  // Train search switched off: the tool is not there for the agent at all.
  const toolNames: string[][] = [];
  const noTrains = nearAirport();
  await planTransport([toWuyuan], wuyuanInput, {
    searchFlights: noTrains.searchFlights,
    model: () => createMoonshotChatModel({
      apiKey: "test", baseUrl: "https://model.test/v1", model: "test",
      fetch: async (_url, init) => {
        const request = JSON.parse(String(init?.body)) as ChatRequest;
        toolNames.push(request.tools?.map(({ function: { name } }) => name) ?? []);
        return reply({ content: "done" });
      },
    }),
  });
  assert.ok(toolNames.length > 0 && toolNames.every((names) => !names.includes("searchAirRail")));
});

test("the agent may pick the flight-then-train journey over a long train", async () => {
  const providers = { ...nearAirport(), searchTrains: async (search: TrainSearch) => search.fromCity === "景德镇" ? onDay(search, onward)
    : onDay(search, { ...train("K1", "06:00", 900), from: "北京西", to: "婺源" }) };
  const outcome = await planTransport([toWuyuan], wuyuanInput, { ...providers, model: fakeModelSteps([
    [{ tool: "searchTrains", args: { leg: 0 } }, { tool: "searchFlights", args: { leg: 0, fromCode: "BJS", toCode: "WUY" } }],
    [{ tool: "searchAirRail", args: { leg: 0, fromCode: "BJS", viaCode: "JDZ", viaCity: "景德镇" } }],
  ], { legs: [{ leg: 0, mode: "air_rail", trainCode: null, flightNo: null, airRailCode: "MU5122/G1234", reason: "飞到景德镇换高铁，5 小时到" }] }) });
  assert.deepEqual(outcome.legs[0].recommendation, { mode: "air_rail", trainCode: null, flightNo: null, airRailCode: "MU5122/G1234",
    reason: "飞到景德镇换高铁，5 小时到", by: "agent" });
  // The 15-hour train is still listed for comparison.
  assert.equal(outcome.legs[0].trains?.options[0]?.code, "K1");
});
