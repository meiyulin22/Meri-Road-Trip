import assert from "node:assert/strict";
import test from "node:test";

import type { TripMessage } from "@/domain/trip-message/trip-message";

import { selectRecentConversationMessages } from "./workspace-conversation-context";

function message(role: TripMessage["role"], content: string): TripMessage {
  return {
    id: `${role}-${content}`,
    tripId: "trip-123",
    role,
    content,
    createdAt: "2026-09-23T00:00:00.000Z",
  };
}

test("empty history leaves the current request single-turn", () => {
  assert.deepEqual(selectRecentConversationMessages([]), []);
});

test("keeps complete turns in chronological order with original roles", () => {
  const history = [
    message("user", "Could we go to Furano?"),
    message("assistant", "Would you like to change the destination to Furano?"),
  ];

  assert.deepEqual(selectRecentConversationMessages(history), [
    { role: "user", content: "Could we go to Furano?" },
    {
      role: "assistant",
      content: "Would you like to change the destination to Furano?",
    },
  ]);
});

test("selects at most the five newest complete turns", () => {
  const history = Array.from({ length: 7 }, (_, index) => [
    message("user", `user ${index}`),
    message("assistant", `assistant ${index}`),
  ]).flat();

  const selected = selectRecentConversationMessages(history);
  assert.equal(selected.length, 10);
  assert.deepEqual(selected[0], { role: "user", content: "user 2" });
  assert.deepEqual(selected.at(-1), {
    role: "assistant",
    content: "assistant 6",
  });
});

test("stops before older turns when the character budget is exhausted", () => {
  const history = [
    message("user", "old user"),
    message("assistant", "old assistant"),
    message("user", "x".repeat(3_000)),
    message("assistant", "y".repeat(3_000)),
  ];

  const selected = selectRecentConversationMessages(history);
  assert.equal(selected.length, 2);
  assert.equal(selected[0].content.length + selected[1].content.length, 6_000);
});

test("drops an oversized newest turn rather than sending unbounded history", () => {
  const history = [
    message("user", "old user"),
    message("assistant", "old assistant"),
    message("user", "x".repeat(6_001)),
    message("assistant", "new assistant"),
  ];

  assert.deepEqual(selectRecentConversationMessages(history), []);
});

test("does not begin with an orphan assistant or include an incomplete turn", () => {
  const history = [
    message("assistant", "orphan"),
    message("user", "real user"),
    message("assistant", "real assistant"),
    message("user", "incomplete user"),
  ];

  assert.deepEqual(selectRecentConversationMessages(history), [
    { role: "user", content: "real user" },
    { role: "assistant", content: "real assistant" },
  ]);
});

test("folds a card selection follow-up into its turn and writes the shown cards out", () => {
  const history: TripMessage[] = [
    message("user", "我想去潮汕"),
    { ...message("assistant", "潮汕 包含下面这几个市，你想去哪几个？"), presentation: {
      type: "destination_recommendations", destinations: [
        { id: "chaozhou", name: "潮州市", province: "广东省" },
        { id: "shantou", name: "汕头市", province: "广东省" },
        { id: "jieyang", name: "揭阳市", province: "广东省" },
      ] } },
    message("assistant", "好，目的地定为广东省 潮州市、汕头市了。"),
  ];

  assert.deepEqual(selectRecentConversationMessages(history), [
    { role: "user", content: "我想去潮汕" },
    { role: "assistant", content: "潮汕 包含下面这几个市，你想去哪几个？\n" +
      "[展示过的卡片] 广东省：潮州市、汕头市、揭阳市\n\n好，目的地定为广东省 潮州市、汕头市了。" },
  ]);
});

test("writes location candidates out with their region", () => {
  const candidate = { providerId: "B1", name: "普陀山", province: "浙江省", city: "舟山市",
    district: "普陀区", region: "浙江省舟山市普陀区", address: null, longitude: 122.38,
    latitude: 30.01, coordinateSystem: "GCJ-02" as const };
  const history: TripMessage[] = [
    message("user", "我想去普陀"),
    { ...message("assistant", "你说的是哪一个？"), presentation: {
      type: "location_candidates", candidates: [candidate, { ...candidate, providerId: "B2",
        name: "普陀区", region: null }] } },
  ];

  assert.equal(selectRecentConversationMessages(history)[1].content,
    "你说的是哪一个？\n[展示过的地点候选] 普陀山（浙江省舟山市普陀区）｜普陀区");
});

test("lists cards offered without a province by name alone", () => {
  const history: TripMessage[] = [
    message("user", "推荐一下"),
    { ...message("assistant", "看看这些"), presentation: {
      type: "destination_recommendations", destinations: [
        { id: "a", name: "丽江市", province: "云南省" },
        { id: "b", name: "北海市", province: null },
      ] } },
  ];

  assert.equal(selectRecentConversationMessages(history)[1].content,
    "看看这些\n[展示过的卡片] 云南省：丽江市；北海市");
});

test("counts the written-out cards against the character budget", () => {
  const history: TripMessage[] = [
    message("user", "x".repeat(2_995)),
    { ...message("assistant", "y".repeat(2_995)), presentation: {
      type: "destination_recommendations", destinations: [{ id: "a", name: "丽江市", province: "云南省" }] } },
  ];

  assert.deepEqual(selectRecentConversationMessages(history), []);
});
