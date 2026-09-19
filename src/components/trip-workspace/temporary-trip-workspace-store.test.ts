import assert from "node:assert/strict";
import test from "node:test";

import type { TripDraft } from "@/domain/trip-draft/trip-draft";

import {
  clearTemporaryTripWorkspace,
  getTemporaryTripWorkspace,
  setTemporaryTripWorkspace,
} from "./temporary-trip-workspace-store";

const draft: TripDraft = {
  name: { state: "known", value: "冬季滑雪之旅" },
  origin: { state: "missing" },
  destination: { state: "missing" },
  startDate: { state: "approximate", value: "今年冬天" },
  endDate: { state: "missing" },
  duration: { state: "approximate", value: "大概一周" },
  transportPreference: { state: "missing" },
};

test("keeps a TripDraft in temporary client state until it is cleared", () => {
  clearTemporaryTripWorkspace();
  setTemporaryTripWorkspace(draft, "今年冬天想找个地方滑雪");

  assert.deepEqual(getTemporaryTripWorkspace(), {
    draft,
    initialMessage: "今年冬天想找个地方滑雪",
  });

  clearTemporaryTripWorkspace();
  assert.equal(getTemporaryTripWorkspace(), null);
});
