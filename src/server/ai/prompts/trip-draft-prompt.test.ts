import assert from "node:assert/strict";
import test from "node:test";

import { buildTripDraftSystemPrompt } from "./trip-draft-prompt";

test("defines Meri TripDraft certainty and preservation semantics", () => {
  const prompt = buildTripDraftSystemPrompt({
    referenceDate: "2026-09-18",
    timezone: "Asia/Shanghai",
  });

  assert.match(prompt, /known:/);
  assert.match(prompt, /approximate:/);
  assert.match(prompt, /missing:/);
  assert.match(prompt, /ambiguous:/);
  assert.match(prompt, /Preserve the user's meaning, not your explanation/);
  assert.match(prompt, /今年冬天/);
  assert.match(prompt, /十月底左右/);
  assert.match(prompt, /大概一周/);
  assert.match(prompt, /origin is where the user will depart from/);
  assert.match(prompt, /二世谷或者富良野都行/);
  assert.match(prompt, /Reference date: 2026-09-18/);
  assert.match(prompt, /Timezone: Asia\/Shanghai/);
});
