import assert from "node:assert/strict";
import test from "node:test";

import type { TripState } from "@/domain/trip-state/trip-state";

import { companionStatus } from "./companion-status-model";

const empty: TripState = {
  name: { state: "missing" }, origin: { state: "missing" }, destination: { state: "missing" },
  startDate: { state: "missing" }, endDate: { state: "missing" }, duration: { state: "missing" },
  transportPreference: { state: "missing" },
};
const guangdong: TripState["destination"] = { state: "known", source: "user", areas: [{ province: "广东省", places: [] }] };

test("a failure and Meri thinking outrank what the Journey still needs", () => {
  assert.equal(companionStatus(empty, "error").mood, "error");
  assert.match(companionStatus(empty, "error").text, /出错了/);
  assert.deepEqual(companionStatus({ ...empty, destination: guangdong }, "thinking"), { mood: "thinking", text: "我想想…" });
});

test("without a destination the bear asks for one and suggests asking for recommendations", () => {
  const status = companionStatus(empty, "idle");
  assert.equal(status.mood, "missing");
  assert.match(status.text, /还差目的地/);
  assert.match(status.text, /帮我推荐几个地方/);
});

test("a destination makes the plan ready, and the optional gaps are named", () => {
  const status = companionStatus({ ...empty, destination: guangdong }, "idle");
  assert.equal(status.mood, "ready");
  assert.match(status.text, /可以生成计划/);
  assert.match(status.text, /出发地、出行时间、交通方式/);
  const complete = companionStatus({
    ...empty,
    destination: guangdong,
    origin: { state: "known", value: "大连", source: "user" },
    duration: { state: "approximate", value: "一周左右", source: "user" },
    transportPreference: { state: "known", value: "self_drive", source: "user" },
  }, "idle");
  assert.deepEqual(complete, { mood: "ready", text: "都齐啦，可以生成计划了！" });
});

test("an old unverified destination asks to be confirmed again", () => {
  const status = companionStatus({ ...empty, destination: { state: "known", source: "user", areas: [], legacyText: "梅里雪山" } }, "idle");
  assert.equal(status.mood, "missing");
  assert.match(status.text, /重新确认/);
});
