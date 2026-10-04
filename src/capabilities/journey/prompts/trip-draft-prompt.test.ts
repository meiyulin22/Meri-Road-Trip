import assert from "node:assert/strict";
import test from "node:test";

import { buildTripDraftSystemPrompt } from "./trip-draft-prompt";
import { certaintyStateGuidance, tripStateFieldGuidance } from "./trip-state-field-guidance";

test("defines Meri TripDraft certainty and preservation semantics", () => {
  const prompt = buildTripDraftSystemPrompt({
    referenceDate: "2026-09-18",
    timezone: "Asia/Shanghai",
    locale: "zh",
  });

  assert.match(prompt, /known:/);
  assert.match(prompt, /approximate:/);
  assert.match(prompt, /missing:/);
  assert.match(prompt, /ambiguous:/);
  assert.match(prompt, /put their own place expressions in places/);
  assert.match(prompt, /Preserve approximate wording for dates and duration/);
  assert.match(prompt, /大概一周/);
  assert.match(prompt, /origin is where the user will depart from/);
  assert.match(prompt, /keep them as separate expressions/);
  assert.match(prompt, /Reference date: 2026-09-18/);
  assert.match(prompt, /Timezone: Asia\/Shanghai/);
});

test("field semantics come from the block the workspace conversation also states", () => {
  const prompt = buildTripDraftSystemPrompt({ referenceDate: "2026-09-18", timezone: "Asia/Shanghai", locale: "zh" });

  assert.ok(prompt.includes(certaintyStateGuidance));
  assert.ok(prompt.includes(tripStateFieldGuidance));
  assert.match(prompt, /startDate and endDate use YYYY-MM-DD only when known/);
  assert.match(prompt, /Resolve sufficiently definite relative dates, such as "明天"/);
});

test("the inferred trip name is written in the language chosen on the landing page", () => {
  const english = buildTripDraftSystemPrompt({ referenceDate: "2026-09-18", timezone: "Asia/Shanghai", locale: "en" });
  const chinese = buildTripDraftSystemPrompt({ referenceDate: "2026-09-18", timezone: "Asia/Shanghai", locale: "zh" });

  assert.match(english, /trip name you infer is the Journey's title in the interface, so write it in English, whatever language the message uses/);
  assert.match(chinese, /so write it in Simplified Chinese/);
});

test("an English first message names its places in Chinese for the provider", () => {
  const english = buildTripDraftSystemPrompt({ referenceDate: "2026-09-18", timezone: "Asia/Shanghai", locale: "en" });

  assert.match(english, /put each place's standard Chinese name in places/);
  assert.match(english, /Lijiang → 丽江/);
  assert.doesNotMatch(english, /put their own place expressions in places/);
  assert.doesNotMatch(english, /stay exactly as the user wrote them/);
});
