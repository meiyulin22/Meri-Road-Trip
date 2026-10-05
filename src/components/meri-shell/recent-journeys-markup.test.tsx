import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { JourneySummary } from "@/platform/persistence/journey-summary-repository";
import { placePhotoHosts } from "@/platform/place-photos/place-photo-provider";
import { imageConfigDefault } from "next/dist/shared/lib/image-config";
import { ImageConfigContext } from "next/dist/shared/lib/image-config-context.shared-runtime";

const nodeRequire = createRequire(import.meta.url);
nodeRequire.extensions[".css"] = (module) => {
  module.exports = { default: new Proxy({}, { get: (_target, key) => String(key) }) };
};

const journey: JourneySummary = {
  id: "3d17d2c7-fd9b-4748-b751-3a76a9a920be",
  name: "Dalian",
  destination: "Dalian",
  destinationAreas: [],
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

test("in Chinese the cards, dates and delete dialog speak Chinese, and Journey names stay as they are", async () => {
  const { RecentJourneys } = await import("./recent-journeys");
  const { LocaleProvider } = await import("@/components/i18n/locale-context");
  const markup = renderToStaticMarkup(<LocaleProvider locale="zh">
    <RecentJourneys journeys={[{ ...journey, destination: null, startDate: "2026-11-01" }]} />
  </LocaleProvider>);
  assert.match(markup, /继续探索/);
  assert.match(markup, /目的地未定/);
  assert.match(markup, /2026-11-01 起/);
  assert.match(markup, /删除「Dalian」？/);
  assert.match(markup, /aria-label="旅程操作"/);
  assert.doesNotMatch(markup, /Continue exploring|Delete/);
});

test("a card shows its cover photo when there is one, and only the illustration otherwise", async () => {
  const { RecentJourneys } = await import("./recent-journeys");
  const url = "https://store.is.autonavi.com/showpic/lijiang";
  const other = { ...journey, id: "6c0f0c1e-2c51-4f0b-9a0e-3d7f2d1c9b11", name: "Hainan" };
  // A build gives next/image the photo hosts allowed in next.config.ts; a test gives them here.
  const images = { ...imageConfigDefault,
    remotePatterns: placePhotoHosts.map((hostname) => ({ protocol: "https" as const, hostname })) };
  const markup = renderToStaticMarkup(<ImageConfigContext.Provider value={images}>
    <RecentJourneys covers={{ [journey.id]: { url, caption: "丽江古城" } }} journeys={[journey, other]} />
  </ImageConfigContext.Provider>);
  assert.equal(markup.match(/<img/g)?.length, 1);
  assert.match(markup, /lijiang/);
  assert.match(markup, /<img alt=""/);
});
