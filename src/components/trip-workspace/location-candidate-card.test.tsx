import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { LocationCandidate } from "@/domain/location/location";
import type { TripState } from "@/domain/trip-state/trip-state";

import { canSelectLocationCandidates, selectLocationCandidate } from "./workspace-conversation-model";

const nodeRequire = createRequire(import.meta.url);
nodeRequire.extensions[".css"] = (module) => {
  module.exports = { default: new Proxy({}, { get: (_target, key) => String(key) }) };
};
let LocationCandidateCard: typeof import("./location-candidate-card").LocationCandidateCard;
test.before(async () => {
  ({ LocationCandidateCard } = await import("./location-candidate-card"));
});

const candidates: LocationCandidate[] = [
  { providerId: "shantou", name: "汕头市", province: "广东省", city: "汕头市", district: "金平区",
    region: "广东省 · 汕头市", address: "金平区", longitude: 116.68, latitude: 23.35, coordinateSystem: "GCJ-02" },
  { providerId: "chaozhou", name: "潮州市", province: "广东省", city: "潮州市", district: "湘桥区",
    region: "广东省 · 潮州市", address: "湘桥区", longitude: 116.62, latitude: 23.65, coordinateSystem: "GCJ-02" },
  { providerId: "jieyang", name: "揭阳市", province: "广东省", city: "揭阳市", district: "榕城区",
    region: "广东省 · 揭阳市", address: "榕城区", longitude: 116.37, latitude: 23.55, coordinateSystem: "GCJ-02" },
];

const unresolved: TripState = {
  name: { state: "missing" }, origin: { state: "missing" }, destination: { state: "missing" },
  startDate: { state: "missing" }, endDate: { state: "missing" },
  duration: { state: "missing" }, transportPreference: { state: "missing" },
};

function markup(candidate: LocationCandidate, selected = false, disabled = false, pending = false): string {
  return renderToStaticMarkup(createElement(LocationCandidateCard, {
    candidate, selected, disabled, pending, onSelect: () => {},
  }));
}

test("candidate identity and context fill one native button card", async () => {
  const card = markup(candidates[0]);
  assert.match(card, /^<button\b/);
  assert.match(card, /type="button"/);
  assert.doesNotMatch(card, /disabled=""/);
  assert.match(card, /汕头市/);
  assert.match(card, /广东省 · 汕头市/);
  assert.match(card, /金平区/);
  assert.match(card, /选择/);
  assert.equal(canSelectLocationCandidates(unresolved, "latest", "latest"), true);
});

test("selection appears only after the server returns authoritative TripState", async () => {
  assert.doesNotMatch(markup(candidates[1]), /已选择/);
  assert.match(markup(candidates[1], false, true, true), /保存中…/);
  assert.doesNotMatch(markup(candidates[1], false, true, true), /已选择/);

  const { tripState: selectedState } = await selectLocationCandidate("trip", "latest", 1, async () =>
    Response.json({ assistantMessage: { id: "follow-up", tripId: "trip", role: "assistant",
      content: "目的地定好了。", createdAt: "2026-09-26T00:00:01.000Z" },
      tripState: { ...unresolved, destination: {
      state: "known", value: "潮州市", source: "user",
      selection: { provider: "amap", providerId: "chaozhou" },
    } } }));
  assert.equal(canSelectLocationCandidates(selectedState, "latest", "latest"), false);
  const cards = candidates.map((candidate) => markup(candidate,
    selectedState.destination.state === "known" &&
      selectedState.destination.value === candidate.name &&
      selectedState.destination.selection?.providerId === candidate.providerId,
    true));
  assert.ok(cards.every((card) => /disabled=""/.test(card)));
  assert.match(cards[1], /data-selected="true"/);
  assert.match(cards[1], /已选择/);
  assert.ok(cards.filter((card) => /已选择/.test(card)).length === 1);
});

test("historical and changed-destination candidates stay visible but cannot be selected", () => {
  assert.equal(canSelectLocationCandidates(unresolved, "old", "latest"), false);
  const changed = { ...unresolved, destination: { state: "known", value: "深圳市", source: "user" } as const };
  assert.equal(canSelectLocationCandidates(changed, "latest", "latest"), false);
  assert.match(markup(candidates[0], false, true), /汕头市/);
  assert.match(markup(candidates[0], false, true), /disabled=""/);
});

test("failed selection leaves candidate action available and preserves the existing error path", async () => {
  await assert.rejects(selectLocationCandidate("trip", "latest", 0,
    async () => Response.json({ error: "failed" }, { status: 500 })));
  assert.equal(canSelectLocationCandidates(unresolved, "latest", "latest"), true);
  assert.doesNotMatch(markup(candidates[0]), /disabled=""/);
});

test("persisted candidate presentation can render again after refresh without local disable state", () => {
  assert.equal(canSelectLocationCandidates(unresolved, "persisted-message", "persisted-message"), true);
  assert.doesNotMatch(markup(candidates[2]), /disabled=""/);
});
