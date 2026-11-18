import assert from "node:assert/strict";
import test from "node:test";

import { planQuestionSchema } from "./plan-progress";
import type { FlightOption, TrainOption } from "./transfer-legs";
import { mentionsTravelMode, transportAnswerOf, transportQuestion } from "./transport-question";

const train = (code: string, minutes: number): TrainOption => ({
  code, from: "上海虹桥", to: "丽江", departs: "10:00", arrives: "10:45", arriveDayOffset: 1, durationMinutes: minutes,
  seats: [{ name: "硬卧", price: 580, left: "有" }],
});
const flight = (flightNo: string, minutes: number, price: number): FlightOption => ({
  flightNo, fromAirport: "上海浦东", toAirport: "丽江三义", departs: "07:55", arrives: "11:50", arriveDayOffset: 0,
  durationMinutes: minutes, cabin: "经济舱", price, seatsLeft: 9, charges: 190, stopCity: null, codeshare: false,
});

test("code writes the question from the real timetable and fares, with the two fixed options (1.2112)", () => {
  const question = transportQuestion([{ kind: "outbound", train: train("G201/Y767", 1485), flight: flight("CA8559", 235, 670) }], "zh");
  assert.equal(question.text, "去程火车最快也要24小时45分（G201/Y767），飞机 CA8559 约3小时55分、¥670。怎么走？");
  assert.equal(question.step, "transfer-legs");
  assert.deepEqual(question.options.map(({ label, kind }) => [label, kind]), [["坚持坐火车", "other"], ["改坐飞机", "other"]]);
  // It is a question the page and the event stream accept.
  assert.ok(planQuestionSchema.safeParse({ id: "00000000-0000-4000-8000-000000000001", ...question }).success);
});

test("setting off and heading home share one question; English has its own words", () => {
  const both = transportQuestion([
    { kind: "outbound", train: train("Z162", 1712), flight: flight("CA8559", 235, 670) },
    { kind: "return", train: train("K1", 1800), flight: flight("MU5", 240, 800) },
  ], "zh");
  assert.match(both.text, /^去程火车最快28小时32分.*；回程火车最快30小时.*MU5 约4小时、¥800。怎么走？$/u);
  const english = transportQuestion([{ kind: "return", train: train("K1", 1800), flight: flight("MU5", 240, 800) }], "en");
  assert.equal(english.text, "The quickest train home takes 30 h (K1); a flight MU5 4 h, ¥800. Train or plane?");
  assert.deepEqual(english.options.map(({ label }) => label), ["Stay on the train", "Fly instead"]);
});

test("a question too long for the card drops the train and flight codes", () => {
  const long = transportQuestion([
    { kind: "outbound", train: train("G1234/K5678", 1712), flight: flight("CA8559", 235, 670) },
    { kind: "return", train: train("K1111/G2222", 1800), flight: flight("MU5555", 240, 800) },
  ], "en");
  assert.ok(long.text.length <= 120);
  assert.doesNotMatch(long.text, /G1234|CA8559/u);
});

test("the answer an option stands for; 'you decide' and anything else let Meri pick", () => {
  assert.equal(transportAnswerOf("坚持坐火车"), "train");
  assert.equal(transportAnswerOf("Fly instead"), "flight");
  assert.equal(transportAnswerOf(null), "auto");
  assert.equal(transportAnswerOf("坐船"), "auto");
});

test("only preferences about trains or flying let the agent decide not to ask", () => {
  assert.equal(mentionsTravelMode(["少走台阶", "想多看古城"]), false);
  assert.equal(mentionsTravelMode(["想坐一次卧铺"]), true);
  assert.equal(mentionsTravelMode(["I'm scared of flying"]), true);
  assert.equal(mentionsTravelMode([]), false);
});
