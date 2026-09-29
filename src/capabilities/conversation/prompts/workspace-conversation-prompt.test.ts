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
  assert.match(text, /While 「去哪」 is still open — no destination at all, or provinces with no place chosen inside them/);
  assert.match(text, /A province the user named does not close that question, it narrows it/);
  assert.match(text, /Once a place inside the destination is settled, presentationIntent is "none"/);
  assert.match(text, /help with that Journey instead of suggesting alternatives/);
  // A named province used to close recommendations here, which is the whole trap
  // step 3 opened in the code; the prompt must not reinstate it.
  assert.doesNotMatch(text, /authoritative destination is known, presentationIntent is "none"/);
  assert.match(text, /Factual questions and destination disambiguation also use "none"/);
  assert.match(text, /A message that is not about travel gets one short, warm reply and one question that leads back to the trip/);
  assert.match(text, /never refuse to engage, lecture the user, or answer an unrelated subject at length/);
  assert.match(text, /write a full reply to what the user just said that leads into the choices/);
  assert.match(text, /your reply is the one the user reads/);
  assert.doesNotMatch(text, /brief acknowledgement only/);
});

test("examples cover recommend, guide, destination update, factual question, and disambiguation", () => {
  const text = prompt();
  for (const example of ["我喜欢雪山、徒步、不想太商业化", "想要海边、轻松一点、适合周末",
    "想吃美食、逛老城", "hi there", "今天天气不错", "我想出去玩",
    "我想去青岛", "青岛九月天气怎么样？", "我想去潮汕",
    "我想去海南", "想看海边小城"]) assert.ok(text.includes(example));
  assert.match(text, /without preferences → intent question, changes \[\], presentationIntent none, then guide/);
  assert.match(text, /with no destination → intent question, changes \[\], destination_recommendations/);
  assert.match(text, /destination update and none/);
  assert.match(text, /destination update, disambiguation, and none/);
  assert.match(text, /Open means TripState\.destination is missing, or its areas name provinces whose places are all empty/);
  assert.match(text, /If any area already names a place, or destinationDisambiguation is known, presentationIntent is "none"/);
  // The rule used to forbid cards whenever the turn changed the destination, which
  // contradicted the code: 「我想去云南，想爬山」 is one turn, not two. What actually
  // decides is whether the message carries a preference the cards can act on.
  assert.match(text, /only when the message carries something the cards can act on/);
  assert.match(text, /Naming a province is not itself a preference/);
  assert.doesNotMatch(text, /changes includes destination, or destinationDisambiguation is known/);
  assert.match(text, /the cards stay inside 海南省/);
});

test("authority, update, tool, and structured-output boundaries remain explicit", () => {
  const text = prompt();
  assert.match(text, /"destination":\{"state":"known","value":"二世谷"/);
  assert.match(text, /Recent real conversation can clarify.*assistant suggestions are not user decisions/);
  assert.match(text, /application validates and persists changes/);
  assert.match(text, /retain the user's destination expression/);
  assert.match(text, /Geographic ambiguity does not turn a clear update into unclear_update_intent/);
  assert.match(text, /destinationDisambiguation to \{"state":"known","value":\["市 1","市 2"\]\}/);
  // 「我想去潮汕」 came back with 潮州古城 on the cards and then saved as the
  // destination. A 景点 is what Generate plan picks inside a 市, never the 市 itself.
  assert.match(text, /2–3 distinct 市 the expression actually contains/);
  assert.match(text, /Name the 市, never a 景点 inside one/);
  assert.match(text, /Otherwise use \{"state":"missing","value":null\}/);
  assert.match(text, /provider IDs, coordinates, or selection metadata/);
  assert.match(text, /TripState\.destination\.value, using that exact value as query/);
  assert.match(text, /Do not resolve origin, conversation mentions, or explicit destination updates/);
  assert.match(text, /selected result preserves the user's chosen identity/);
  assert.match(text, /provider_error or unavailable/);
  assert.match(text, /real-world information beyond location lookup, say research is not connected yet/);
  // Stated abstractly, the model read climate averages as general knowledge and
  // answered 「一般在 22-28℃」. The category is named and the loophole is named.
  assert.match(text, /weather, temperature, climate and seasonal conditions, prices, opening hours, crowd levels/);
  assert.match(text, /A typical, average or seasonal answer is still a guess/);
  // A no-op change is a change that could clear a field that did have a value.
  assert.match(text, /never propose missing for a field TripState already has as missing/);
  assert.match(text, /never restate untouched fields as changes/);
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
  assert.match(text, /Never say whether the Journey is ready to generate, or what is still blocking it/);
  assert.match(text, /the application owns that sentence and adds it itself/);
  // Asked outright, the model answered with a blocker and a promise. The rule needed
  // the case spelled out, not only stated.
  assert.match(text, /When the user asks outright whether a plan can be generated/);
  assert.match(text, /without naming a missing field as the condition/);
  assert.doesNotMatch(text, /optional refinements\./);
  // The model claiming readiness would double up with the sentence composeTurnReply
  // appends, and would sometimes contradict it.
  assert.doesNotMatch(text, /say the Journey is ready for Generate plan/);
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
