import assert from "node:assert/strict";
import test from "node:test";

import { buildTripDraftSystemPrompt } from "./trip-draft-prompt";
import { certaintyStateGuidance, tripStateFieldGuidance } from "./trip-state-field-guidance";

test("defines Meri TripDraft certainty and preservation semantics", () => {
  const prompt = buildTripDraftSystemPrompt({
    referenceDate: "2026-09-18",
    timezone: "Asia/Shanghai",
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
  const prompt = buildTripDraftSystemPrompt({ referenceDate: "2026-09-18", timezone: "Asia/Shanghai" });

  assert.ok(prompt.includes(certaintyStateGuidance));
  assert.ok(prompt.includes(tripStateFieldGuidance));
  assert.match(prompt, /startDate and endDate use YYYY-MM-DD only when known/);
  assert.match(prompt, /Resolve sufficiently definite relative dates, such as "明天"/);
});
