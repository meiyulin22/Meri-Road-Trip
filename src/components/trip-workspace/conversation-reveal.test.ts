import assert from "node:assert/strict";
import test from "node:test";

import { nextRevealCharacterCount, visibleAssistantText } from "./conversation-reveal";

test("reveals only committed assistant text in three-character presentation steps", () => {
  const content = "好的，富良野。";
  const firstCount = nextRevealCharacterCount(content, 0);

  assert.equal(visibleAssistantText(content, 0), "");
  assert.equal(visibleAssistantText(content, firstCount), "好的，");
  assert.equal(nextRevealCharacterCount(content, 100), Array.from(content).length);
});
