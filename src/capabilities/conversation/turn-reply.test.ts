import assert from "node:assert/strict";
import test from "node:test";

import type { TripState } from "@/domain/trip-state/trip-state";
import type { DestinationEditResult } from "@/capabilities/destination/apply-destination-edit";
import { destinationEditReply } from "./turn-reply";

const empty: TripState = {
  name: { state: "missing" }, origin: { state: "missing" }, destination: { state: "missing" },
  startDate: { state: "missing" }, endDate: { state: "missing" },
  duration: { state: "missing" }, transportPreference: { state: "missing" },
};
const yunnan: TripState = { ...empty, destination: { state: "known", source: "user",
  areas: [{ province: "云南省", places: [] }] } };
const nothing: DestinationEditResult = { destination: empty.destination, changed: false, added: [], choices: null,
  unresolved: [], lookupFailed: [], notInDestination: [], ambiguousRemovals: [] };
const modelReply = "你打算从哪里出发？";

test("a turn that did nothing to the destination is the model's reply alone", () => {
  assert.equal(destinationEditReply(nothing, modelReply, empty, empty), modelReply);
});

test("an exact place is announced, readiness once on the turn that makes it ready, then the model's question", () => {
  const added = { ...nothing, changed: true, destination: yunnan.destination,
    added: [{ province: "云南省", place: null, spot: null }] };
  assert.equal(destinationEditReply(added, modelReply, empty, yunnan),
    "已加入云南省。现在已经可以开始生成旅行计划。你可以直接告诉我开始生成，或者点击 Generate plan。你打算从哪里出发？");
  const lijiang: TripState = { ...empty, destination: { state: "known", source: "user",
    areas: [{ province: "云南省", places: [{ name: "丽江市", spots: ["玉龙雪山"] }] }] } };
  const more = { ...added, destination: lijiang.destination, added: [{ province: "云南省", place: "丽江市", spot: "玉龙雪山" }] };
  assert.equal(destinationEditReply(more, modelReply, yunnan, lijiang), "已加入云南省 丽江市（玉龙雪山）。你打算从哪里出发？");
});

test("a card or an unplaced name is the turn's news, and the model's reply is left out", () => {
  const choices = { ...nothing, unresolved: ["大里"], choices: { answering: "潮汕", presentation: {
    type: "destination_choices" as const, mode: "add" as const, choices: [{ id: "a", name: "潮州市", province: "广东省" }] } } };
  assert.equal(destinationEditReply(choices, modelReply, empty, empty),
    "找到「潮汕」相关的地点了，点击添加后才会记入旅程。「大里」暂时没找到。");
  assert.equal(destinationEditReply({ ...nothing, unresolved: ["大里"] }, modelReply, empty, empty),
    "暂时没找到「大里」的可靠地点，目的地没有因此改变。");
  assert.equal(destinationEditReply({ ...nothing, lookupFailed: ["大连"] }, modelReply, empty, empty),
    "地点查询暂时不可用，目的地没有改变。请稍后重试。");
});
