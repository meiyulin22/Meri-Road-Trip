import assert from "node:assert/strict";
import test from "node:test";

import type { TripDraft } from "@/domain/trip-draft/trip-draft";

import {
  canSubmitTripDraft,
  createInitialComposerState,
  createJourneyAndNavigate,
  JourneyCreationRequestError,
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

test("clears the composer before leaving after a successful submission", () => {
  const submittingState = {
    ...createInitialComposerState(),
    message: "今年冬天想出去走走",
    phase: "submitting" as const,
  };

  const succeededState = newTripComposerReducer(submittingState, {
    type: "submission.succeeded",
    draft,
  });

  assert.equal(succeededState.message, "");
  assert.equal(succeededState.phase, "review");
  assert.equal(canSubmitTripDraft(succeededState), false);
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

test("creates a Journey and navigates to its real Trip ID", async () => {
  const navigations: string[] = [];

  const tripId = await createJourneyAndNavigate(
    draft,
    (path) => navigations.push(path),
    async () => Response.json({ trip: { id: "trip_123" } }, { status: 201 }),
  );

  assert.equal(tripId, "trip_123");
  assert.deepEqual(navigations, ["/trips/trip_123"]);
});

test("does not navigate when Journey persistence fails", async () => {
  const navigations: string[] = [];

  await assert.rejects(
    createJourneyAndNavigate(
      draft,
      (path) => navigations.push(path),
      async () => Response.json({ error: "failed" }, { status: 500 }),
    ),
    JourneyCreationRequestError,
  );

  assert.deepEqual(navigations, []);
});
