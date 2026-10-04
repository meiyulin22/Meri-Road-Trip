import assert from "node:assert/strict";
import test from "node:test";

import type { TripState } from "@/domain/trip-state/trip-state";
import {
  certaintyStateGuidance,
  tripStateFieldGuidance,
} from "@/capabilities/journey/prompts/trip-state-field-guidance";
import type { Locale } from "@/domain/locale/locale";
import { replyLanguageGuidance } from "./reply-language-guidance";
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

function prompt(mode: "conversation" | "opening" = "conversation", locale: Locale = "zh") {
  return buildWorkspaceConversationSystemPrompt({ tripState, referenceDate: "2026-09-27",
    timezone: "Asia/Shanghai", mode, locale });
}

test("both modes reply in the landing page's language and leave following the user to the model", () => {
  for (const mode of ["conversation", "opening"] as const) {
    const english = prompt(mode, "en");
    assert.ok(english.includes(replyLanguageGuidance("en")));
    assert.match(english, /decide it from the user's current message alone/);
    assert.match(english, /if it is written in Chinese sentences, reply in Chinese/);
    assert.match(english, /reply in English, the language the user chose on Meri's home page/);
    assert.match(english, /trip name you propose is written in English/);
    assert.match(prompt(mode, "zh"), /reply in Simplified Chinese, the language the user chose/);
  }
});


test("prompt keeps model edits distinct from provider verification and user confirmation",()=>{
 const text=prompt();assert.match(text,/TripState is authoritative/);assert.match(text,/never says a place was or was not added/);assert.match(text,/never propose destination in changes/);assert.match(text,/梅里雪山/);assert.match(text,/operation "remove"/);assert.match(text,/Only a unique match/);assert.match(text,/Do not invent provider IDs/);
});
test("recommendations and planning have explicit boundaries",()=>{
 const text=prompt();assert.match(text,/no destination, or only provinces with no city chosen/);assert.match(text,/Generate plan produces the plan/);assert.match(text,/Never say whether the Journey is ready to generate/);assert.ok(text.includes(certaintyStateGuidance));assert.ok(text.includes(tripStateFieldGuidance));
});
test("opening mode replies without proposing a new edit",()=>{
 const text=prompt("opening");assert.match(text,/Current authoritative TripState/);assert.match(text,/二世谷/);assert.match(text,/changes \[\]/);assert.match(text,/already been interpreted/);
});

test("new destinations default to addition across provinces and overseas requests do not reset state", () => {
  const text = prompt();
  assert.match(text, /a newly named place defaults to operation "add"/);
  assert.match(text, /我想去青岛/);
  assert.match(text, /纽约 does not reset that state/);
  assert.match(text, /Only operation "remove" may delete/);
});

test("China scope is a conditional rule for travellers from anywhere, not a line to recite", () => {
  for (const text of [prompt(), prompt("opening")]) {
    assert.match(text, /destinations in China, for travellers from any country/);
    assert.match(text, /Only when the user names a destination outside China/);
    assert.match(text, /never ask whether the trip is in China or abroad/);
    assert.match(text, /Hong Kong, Macao and Taiwan/);
    assert.doesNotMatch(text, /目前支持国内旅行/);
    assert.doesNotMatch(text, /domestic/);
  }
});

test("an explicit request gets cards at once, widening has its own intent, and the lead-in names nothing", () => {
  const text = prompt();
  assert.match(text, /An explicit request is enough on its own: never ask for dates/);
  assert.match(text, /"我想安静一点的地方"/);
  assert.match(text, /"destination_recommendations_elsewhere"/);
  assert.match(text, /推荐别的省份/);
  assert.match(text, /Name no place, list nothing, promise no number, and ask no question/);
});

test("restored rules: no unchanged fields, no readiness claims, weather without numbers, one question", () => {
  const text = prompt();
  assert.match(text, /never restate a field's current value/);
  assert.match(text, /never for one already missing/);
  assert.match(text, /do not answer that question/);
  assert.match(text, /dry or rainy season/);
  assert.match(text, /Give no temperatures, rainfall or other numbers/);
  assert.match(text, /prices, opening hours, crowd levels/);
  assert.match(text, /Ask at most one question per reply/);
  assert.match(text, /no 已记录、已添加、已加入/);
});

test("the English prompt teaches with English examples and passes places on in Chinese", () => {
  const english = prompt("conversation", "en");
  assert.match(english, /Lijiang → 丽江, Jade Dragon Snow Mountain → 玉龙雪山/);
  assert.match(english, /The user confirms every translated name on a card before it is saved/);
  assert.match(english, /"I don't want to go to Yunnan anymore": operation "remove", places \["云南"\]/);
  assert.match(english, /"recommend somewhere", "any good places\?", "you pick"/);
  assert.match(english, /average temperatures are about 22–28°C/);
  assert.doesNotMatch(english, /stay exactly as the user typed them/);
  assert.doesNotMatch(english, /推荐一下|已记录|平均气温/);
  // The rules themselves are shared, written once for both languages.
  for (const rule of [/Ask at most one question per reply/, /Never say whether the Journey is ready to generate/,
    /never restate a field's current value/, /Give no temperatures, rainfall or other numbers/]) {
    assert.match(english, rule);
    assert.match(prompt("conversation", "zh"), rule);
  }
});
