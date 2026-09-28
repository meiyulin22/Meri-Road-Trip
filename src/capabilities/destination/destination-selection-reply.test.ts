import assert from "node:assert/strict";
import test from "node:test";

import type { TripState } from "@/domain/trip-state/trip-state";

import { destinationSelectionReply } from "./destination-selection-reply";

const selected: TripState = {
  name: { state: "missing" }, origin: { state: "missing" },
  destination: { state: "known", value: "汕头老城", source: "user",
    selection: { provider: "amap", providerId: "secret-provider-id",
      coordinates: { longitude: 116.7, latitude: 23.3, coordinateSystem: "GCJ-02" } } },
  startDate: { state: "missing" }, endDate: { state: "missing" },
  duration: { state: "missing" }, transportPreference: { state: "missing" },
};
const ready = { canProceed: true, destination: "selected" } as const;
const knownOrigin = { state: "known", value: "上海", source: "user" } as const;

test("ready reply uses final destination and offers optional missing details", () => {
  const reply = destinationSelectionReply(selected, ready);
  assert.match(reply, /目的地定为汕头老城了/);
  assert.match(reply, /现在已经可以开始生成旅行计划/);
  assert.match(reply, /告诉我开始生成/);
  assert.match(reply, /Generate plan/);
  assert.match(reply, /继续补充出发地、出发时间、行程天数/);
  assert.doesNotMatch(reply, /secret-provider-id|116\.7|匹配到地点/);
});

test("known duration or dates are acknowledged and never requested again", () => {
  const withDuration: TripState = { ...selected,
    duration: { state: "known", value: "三天", source: "user" } };
  const durationReply = destinationSelectionReply(withDuration, ready);
  assert.match(durationReply, /行程时长也已经记下/);
  assert.match(durationReply, /继续补充出发地、出发时间/);
  assert.doesNotMatch(durationReply, /继续补充行程天数/);

  const withDate: TripState = { ...selected,
    startDate: { state: "known", value: "十一月", source: "user" } };
  const dateReply = destinationSelectionReply(withDate, ready);
  assert.match(dateReply, /时间也已经有了/);
  assert.match(dateReply, /继续补充出发地、行程天数/);
  assert.doesNotMatch(dateReply, /继续补充出发时间/);

  const complete = destinationSelectionReply(
    { ...withDate, duration: withDuration.duration, origin: knownOrigin }, ready);
  assert.match(complete, /时间和行程时长也已经记下/);
  assert.doesNotMatch(complete, /继续补充/);
});

test("approximate details are not described as known or requested again", () => {
  const approximate: TripState = { ...selected, origin: knownOrigin,
    startDate: { state: "approximate", value: "十一月左右", source: "user" },
    duration: { state: "approximate", value: "三四天", source: "user" } };
  const reply = destinationSelectionReply(approximate, ready);
  assert.doesNotMatch(reply, /时间也已经有了|行程时长也已经记下|继续补充/);
});

test("non-ready result guides the actual blocker and makes no readiness claim", () => {
  for (const [reason, expected] of [
    ["destination_missing", /确认目的地/],
    ["destination_ambiguous", /确定具体地点/],
    ["destination_unresolved", /更具体的地点/],
    ["provider_error", /稍后再试/],
  ] as const) {
    const reply = destinationSelectionReply(selected, { canProceed: false, reason });
    assert.match(reply, expected);
    assert.doesNotMatch(reply, /可以开始生成|Generate plan/);
  }
});

test("origin is asked for, since a plan has to know where the user leaves from", () => {
  const withDates: TripState = { ...selected,
    startDate: { state: "known", value: "2026-11-20", source: "user" },
    duration: { state: "known", value: "三天", source: "user" } };
  assert.match(destinationSelectionReply(withDates, ready), /继续补充出发地。/);
  assert.doesNotMatch(destinationSelectionReply({ ...withDates, origin: knownOrigin }, ready), /继续补充/);
});
