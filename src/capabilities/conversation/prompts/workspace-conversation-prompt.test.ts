import assert from "node:assert/strict";
import test from "node:test";

import type { TripState } from "@/domain/trip-state/trip-state";
import {
  certaintyStateGuidance,
  tripStateFieldGuidance,
} from "@/capabilities/journey/prompts/trip-state-field-guidance";
import { buildWorkspaceConversationSystemPrompt } from "./workspace-conversation-prompt";

const tripState: TripState = {
  name: { state: "known", value: "二世谷滑雪", source: "system" },
  origin: { state: "missing" },
  destination: { state: "known" as const, source: "user", areas: [], legacyText: "二世谷" },
  startDate: { state: "missing" },
  endDate: { state: "missing" },
  duration: { state: "missing" },
  transportPreference: { state: "missing" },
};

function prompt(mode: "conversation" | "opening" = "conversation") {
  return buildWorkspaceConversationSystemPrompt({ tripState, referenceDate: "2026-09-27",
    timezone: "Asia/Shanghai", mode });
}


test("prompt keeps model edits distinct from provider verification and user confirmation",()=>{
 const text=prompt();assert.match(text,/TripState is authoritative/);assert.match(text,/none is added until the user clicks/);assert.match(text,/never propose destination in changes/);assert.match(text,/梅里雪山/);assert.match(text,/operation "remove"/);assert.match(text,/Only a unique match/);assert.match(text,/Do not invent provider IDs/);
});
test("recommendations and planning have explicit boundaries",()=>{
 const text=prompt();assert.match(text,/missing or provinces with no selected city/);assert.match(text,/Generate plan is a separate action/);assert.match(text,/Do not write a schedule or claim the trip is ready/);assert.ok(text.includes(certaintyStateGuidance));assert.ok(text.includes(tripStateFieldGuidance));
});
test("opening mode replies without proposing a new edit",()=>{
 const text=prompt("opening");assert.match(text,/Current authoritative TripState/);assert.match(text,/二世谷/);assert.match(text,/changes \[\]/);assert.match(text,/already been interpreted/);
});
