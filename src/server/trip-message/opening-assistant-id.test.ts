import assert from "node:assert/strict";
import test from "node:test";

import { openingAssistantMessageId } from "./opening-assistant-id";

test("opening assistant ID is a stable UUID scoped to the Trip", () => {
  const first = openingAssistantMessageId("3d17d2c7-fd9b-4748-b751-3a76a9a920be");
  assert.equal(first, openingAssistantMessageId("3d17d2c7-fd9b-4748-b751-3a76a9a920be"));
  assert.notEqual(first, openingAssistantMessageId("f9eb62d2-95e6-4693-80d1-c808d70c17dc"));
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
