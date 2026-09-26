import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { JourneySummary } from "@/repositories/journey-summary-repository";

const nodeRequire = createRequire(import.meta.url);
nodeRequire.extensions[".css"] = (module) => {
  module.exports = { default: new Proxy({}, { get: (_target, key) => String(key) }) };
};

const journey: JourneySummary = {
  id: "3d17d2c7-fd9b-4748-b751-3a76a9a920be",
  name: "Dalian",
  destination: "Dalian",
  startDate: null,
  endDate: null,
  status: "planning",
  updatedAt: "2026-09-26T00:00:00.000Z",
};

test("card navigation and Journey actions are sibling controls", async () => {
  const { RecentJourneys } = await import("./recent-journeys");
  const markup = renderToStaticMarkup(<RecentJourneys journeys={[journey]} />);
  assert.match(markup, /href="\/trips\/3d17d2c7-fd9b-4748-b751-3a76a9a920be"/);
  assert.match(markup, /<\/a><button[^>]*aria-label="Journey actions"/);
  assert.match(markup, /<dialog[^>]*aria-labelledby=/);
  assert.match(markup, /Delete “Dalian”\?/);
  assert.match(markup, /This journey and its conversation will be permanently deleted\./);
  assert.match(markup, />Cancel<\/button>/);
  assert.match(markup, />Delete<\/button>/);
});
