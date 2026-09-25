import assert from "node:assert/strict";
import test from "node:test";

import type { TripMessage } from "@/domain/trip-message/trip-message";
import type { TripState } from "@/domain/trip-state/trip-state";
import { TripNotFoundError } from "@/domain/trip/trip-errors";
import { selectRecentConversationMessages } from "@/server/ai/workspace-conversation-context";
import { openingAssistantMessageId } from "./opening-assistant-id";
import {
  isPendingOpeningConversation,
  OpeningConversationNotEligibleError,
  OpeningConversationService,
} from "./opening-conversation-service";

const tripId = "3d17d2c7-fd9b-4748-b751-3a76a9a920be";
const ownerGuestId = "25ba5b26-8db0-4fe3-bfcc-b684dd7889cc";
const state: TripState = {
  name: { state: "known", value: "日本滑雪", source: "system" },
  origin: { state: "missing" },
  destination: { state: "known", value: "日本", source: "user" },
  startDate: { state: "approximate", value: "十月", source: "user" },
  endDate: { state: "missing" },
  duration: { state: "known", value: "一周", source: "user" },
  transportPreference: { state: "missing" },
};
const user: TripMessage = {
  id: "00000000-0000-4000-8000-000000000001",
  tripId,
  role: "user",
  content: "I want to go skiing in Japan for a week in October.",
  createdAt: "2026-09-25T01:00:00.000Z",
};
const input = { tripId, ownerGuestId, requestId: "request-1", referenceDate: "2026-09-25", timezone: "Asia/Shanghai" };

function fixture(initial: TripMessage[] = [user]) {
  const messages = [...initial];
  let generations = 0;
  let insertError: Error | null = null;
  let aiError: Error | null = null;
  const service = new OpeningConversationService({
    async loadTripState(_tripId, owner) {
      if (owner !== ownerGuestId) throw new TripNotFoundError(tripId);
      return state;
    },
    async listMessages() { return [...messages]; },
    async generateReply(request) {
      generations += 1;
      assert.equal(request.message, user.content);
      assert.strictEqual(request.tripState, state);
      if (aiError) throw aiError;
      return "滑雪旅行听起来很棒！十月的安排可以慢慢细化。你更想去哪个地区？";
    },
    async persistAssistant(request) {
      if (insertError) throw insertError;
      const id = openingAssistantMessageId(request.tripId);
      const winner = messages.find((message) => message.id === id);
      if (winner) return winner;
      const assistant: TripMessage = {
        id, tripId, role: "assistant", content: request.content,
        createdAt: "2026-09-25T01:00:01.000Z",
      };
      messages.push(assistant);
      return assistant;
    },
  });
  return {
    service,
    messages,
    get generations() { return generations; },
    failAI(error: Error | null) { aiError = error; },
    failInsert(error: Error | null) { insertError = error; },
  };
}

test("initializes one real assistant reply and forms a normal context pair", async () => {
  const setup = fixture();
  const assistant = await setup.service.initialize(input);
  assert.equal(assistant.id, openingAssistantMessageId(tripId));
  assert.equal(assistant.role, "assistant");
  assert.deepEqual(setup.messages.map((message) => message.role), ["user", "assistant"]);
  assert.deepEqual(selectRecentConversationMessages(setup.messages), [
    { role: "user", content: user.content },
    { role: "assistant", content: assistant.content },
  ]);
});

test("duplicate POST and revisit return the stored reply without another model call", async () => {
  const setup = fixture();
  const first = await setup.service.initialize(input);
  assert.strictEqual(await setup.service.initialize(input), first);
  assert.strictEqual(await setup.service.initialize(input), first);
  assert.equal(setup.generations, 1);
  assert.equal(setup.messages.length, 2);
});

test("concurrent initialization stores one assistant", async () => {
  const setup = fixture();
  const [left, right] = await Promise.all([
    setup.service.initialize(input),
    setup.service.initialize(input),
  ]);
  assert.equal(left.id, right.id);
  assert.equal(setup.messages.length, 2);
});

test("AI and persistence failures keep the initial user and allow retry", async () => {
  const setup = fixture();
  setup.failAI(new Error("model unavailable"));
  await assert.rejects(setup.service.initialize(input));
  assert.deepEqual(setup.messages, [user]);
  setup.failAI(null);
  setup.failInsert(new Error("database unavailable"));
  await assert.rejects(setup.service.initialize(input));
  assert.deepEqual(setup.messages, [user]);
  setup.failInsert(null);
  await setup.service.initialize(input);
  assert.equal(setup.messages.length, 2);
});

test("zero messages, unrelated conversations, and wrong owner are ineligible", async () => {
  assert.equal(isPendingOpeningConversation([]), false);
  assert.equal(isPendingOpeningConversation([user]), true);
  assert.equal(isPendingOpeningConversation([user, {
    ...user,
    id: openingAssistantMessageId(tripId),
    role: "assistant",
  }]), false);
  await assert.rejects(fixture([]).service.initialize(input), OpeningConversationNotEligibleError);
  await assert.rejects(fixture([user, { ...user, id: "00000000-0000-4000-8000-000000000002", role: "assistant" }]).service.initialize(input), OpeningConversationNotEligibleError);
  await assert.rejects(fixture().service.initialize({ ...input, ownerGuestId: "other-owner" }), TripNotFoundError);
});
