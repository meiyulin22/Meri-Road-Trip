import assert from "node:assert/strict";
import test from "node:test";

import type { TripDraft } from "@/domain/trip-draft/trip-draft";

import {
  canSubmitTripDraft,
  createInitialComposerState,
  newTripComposerReducer,
  requestTripDraft,
  TripDraftRequestError,
} from "./new-trip-composer-model";

const draft: TripDraft = {
  name: { state: "known", value: "冬季旅行" },
  origin: { state: "missing" },
  destination: { state: "missing" },
  startDate: { state: "approximate", value: "今年冬天" },
  endDate: { state: "missing" },
  duration: { state: "missing" },
  transportPreference: { state: "known", value: "flexible" },
};

test("does not submit an empty trip idea", async () => {
  let requestCount = 0;
  const fetcher: typeof fetch = async () => {
    requestCount += 1;
    return Response.json({ draft });
  };

  await assert.rejects(
    () => requestTripDraft("   ", fetcher),
    TripDraftRequestError,
  );
  assert.equal(requestCount, 0);
  assert.equal(canSubmitTripDraft(createInitialComposerState()), false);
});

test("accepts a successful validated TripDraft response", async () => {
  const fetcher: typeof fetch = async () => Response.json({ draft });

  assert.deepEqual(await requestTripDraft("今年冬天想出去走走", fetcher), draft);
});

test("preserves input and allows retry after an API failure", () => {
  const initialState = {
    ...createInitialComposerState(),
    message: "今年冬天想出去走走",
  };
  const submittingState = newTripComposerReducer(initialState, {
    type: "submission.started",
  });
  const failedState = newTripComposerReducer(submittingState, {
    type: "submission.failed",
    error: "请稍后重试。",
  });

  assert.equal(failedState.message, initialState.message);
  assert.equal(failedState.phase, "error");
  assert.equal(canSubmitTripDraft(failedState), true);
});
