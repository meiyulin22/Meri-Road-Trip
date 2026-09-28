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
  destination: { state: "known", value: "二世谷", source: "user" },
  startDate: { state: "missing" },
  endDate: { state: "missing" },
  duration: { state: "missing" },
  transportPreference: { state: "missing" },
};

function prompt(mode: "conversation" | "opening" = "conversation") {
  return buildWorkspaceConversationSystemPrompt({ tripState, referenceDate: "2026-09-27",
    timezone: "Asia/Shanghai", mode });
}

test("conversation principle and presentation decision appear before implementation details", () => {
  const text = prompt();
  assert.ok(text.indexOf("有偏好就推荐；没偏好就引导；有目的地就补齐信息") < text.indexOf("Current authoritative TripState"));
  assert.ok(text.indexOf("presentationIntent") < text.indexOf("resolve_location tool boundary"));
  assert.match(text, /destination choices would naturally help/);
  assert.match(text, /cards themselves clarify/);
  assert.match(text, /authoritative destination is known, presentationIntent is "none"/);
  assert.match(text, /help with that Journey instead of suggesting alternatives/);
  assert.match(text, /Factual questions and destination disambiguation also use "none"/);
  assert.match(text, /brief acknowledgement only/);
});

test("examples cover recommend, guide, destination update, factual question, and disambiguation", () => {
  const text = prompt();
  for (const example of ["我喜欢雪山、徒步、不想太商业化", "想要海边、轻松一点、适合周末",
    "想吃美食、逛老城", "hi there", "今天天气不错", "我想出去玩",
    "我想去青岛", "青岛九月天气怎么样？", "我想去潮汕"]) assert.ok(text.includes(example));
  assert.match(text, /without preferences → intent question, changes \[\], presentationIntent none, then guide/);
  assert.match(text, /with no destination → intent question, changes \[\], destination_recommendations/);
  assert.match(text, /destination update and none/);
  assert.match(text, /destination update, disambiguation, and none/);
  assert.match(text, /If authoritative TripState\.destination is not missing, changes includes destination, or destinationDisambiguation is known, presentationIntent is "none"/);
});

test("authority, update, tool, and structured-output boundaries remain explicit", () => {
  const text = prompt();
  assert.match(text, /"destination":\{"state":"known","value":"二世谷"/);
  assert.match(text, /Recent real conversation can clarify.*assistant suggestions are not user decisions/);
  assert.match(text, /application validates and persists changes/);
  assert.match(text, /retain the user's destination expression/);
  assert.match(text, /Geographic ambiguity does not turn a clear update into unclear_update_intent/);
  assert.match(text, /destinationDisambiguation to \{"state":"known","value":\["place 1","place 2"\]\}/);
  assert.match(text, /Otherwise use \{"state":"missing","value":null\}/);
  assert.match(text, /2–3 distinct, concise concrete place expressions/);
  assert.match(text, /provider IDs, coordinates, or selection metadata/);
  assert.match(text, /TripState\.destination\.value, using that exact value as query/);
  assert.match(text, /Do not resolve origin, conversation mentions, or explicit destination updates/);
  assert.match(text, /selected result preserves the user's chosen identity/);
  assert.match(text, /provider_error or unavailable/);
  assert.match(text, /real-world information beyond location lookup, say research is not connected yet/);
  assert.match(text, /Return only JSON matching the supplied schema/);
  assert.match(text, /Allowed fields: name, origin, destination, startDate, endDate, duration, transportPreference/);
  assert.match(text, /Each change has only field, state, value/);
  assert.match(text, /transportPreference may be known only as one of/);
  assert.match(text, /approximate startDate/);
});

test("the plan itself is left to Generate plan and the details it runs on are asked for", () => {
  const text = prompt();
  assert.match(text, /Generate plan produces the plan, not this conversation/);
  assert.match(text, /Never write an itinerary, a day-by-day schedule, a route, or a daily pace/);
  assert.match(text, /Origin, dates, and duration are what a plan runs on rather than optional refinements/);
  assert.match(text, /origin first while it is missing/);
  assert.match(text, /say the Journey is ready for Generate plan/);
  assert.doesNotMatch(text, /optional refinements\./);
});

test("field semantics are the same text the first-message extractor states", () => {
  // The two prompts drifted once, and only the extractor resolved a relative
  // date. Sharing the text is the fix, so both must carry it verbatim.
  const text = prompt();
  assert.ok(text.includes(certaintyStateGuidance));
  assert.ok(text.includes(tripStateFieldGuidance));
  assert.match(text, /startDate and endDate use YYYY-MM-DD only when known/);
  assert.match(text, /Resolve sufficiently definite relative dates, such as "明天"/);
  assert.match(text, /"我想明天出发" → known startDate holding the date the reference date resolves to/);
});

test("opening mode uses established TripState without conversation instructions", () => {
  const text = prompt("opening");
  assert.match(text, /first user message of a new Journey/);
  assert.match(text, /Current authoritative TripState/);
  assert.match(text, /intent "question", presentationIntent "none", changes \[\]/);
  assert.match(text, /experience the user wants/);
  assert.match(text, /Do not call tools/);
  assert.doesNotMatch(text, /resolve_location tool boundary/);
  assert.doesNotMatch(text, /destinationDisambiguation/);
});
