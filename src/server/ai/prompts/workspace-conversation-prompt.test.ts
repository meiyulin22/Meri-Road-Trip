import assert from "node:assert/strict";
import test from "node:test";

import type { TripState } from "@/domain/trip-state/trip-state";
import { buildWorkspaceConversationSystemPrompt } from "./workspace-conversation-prompt";

const tripState: TripState = {
  name: { state: "known", value: "二世谷滑雪", source: "system" },
  origin: { state: "missing" },
  destination: { state: "known", value: "二世谷", source: "user" },
  startDate: { state: "missing" },
  endDate: { state: "missing" },
  duration: { state: "missing" },
  transportPreference: { state: "missing" },
};

test("distinguishes destination mentions from explicit update intent", () => {
  const prompt = buildWorkspaceConversationSystemPrompt({
    tripState,
    referenceDate: "2026-09-19",
    timezone: "Asia/Shanghai",
  });

  assert.match(prompt, /Current authoritative TripState/);
  assert.match(prompt, /Previous conversation messages may clarify references/);
  assert.match(prompt, /earlier assistant suggestion alone must not change TripState/);
  assert.match(prompt, /"destination":\{"state":"known","value":"二世谷"/);
  assert.match(prompt, /富良野雪怎么样？.*question/);
  assert.match(prompt, /要不富良野？.*unclear_update_intent/);
  assert.match(prompt, /Never return source/);
  assert.match(prompt, /resolved result is a geographic match, not a user-confirmed TripState value/);
  assert.match(prompt, /current task needs geographic identification or disambiguation/);
  assert.match(prompt, /origin or destination in TripState alone is not a reason/);
  assert.match(prompt, /casual conversation, meta questions about Meri/);
  assert.match(prompt, /Do not call resolve_location for an explicit destination update/);
  assert.match(prompt, /application resolves the committed destination after persistence/);
  assert.match(prompt, /Geographic ambiguity does not make the user's update intent unclear/);
});
