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
  retryOpeningAndNavigate,
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
    "  我想去日本滑雪。  ",
    (path) => navigations.push(path),
    () => assert.fail("opening should have succeeded"),
    async (_url, init) => {
      assert.deepEqual(JSON.parse(init?.body as string), {
        draft,
        initialUserMessage: "  我想去日本滑雪。  ",
      });
      return Response.json({ trip: { id: "trip_123" }, opening: "completed" }, { status: 201 });
    },
  );

  assert.equal(tripId, "trip_123");
  assert.deepEqual(navigations, ["/trips/trip_123"]);
});

test("does not navigate when Journey persistence fails", async () => {
  const navigations: string[] = [];

  await assert.rejects(
    createJourneyAndNavigate(
      draft,
      "我想去日本滑雪。",
      (path) => navigations.push(path),
      () => assert.fail("creation failed before opening"),
      async () => Response.json({ error: "failed" }, { status: 500 }),
    ),
    JourneyCreationRequestError,
  );

  assert.deepEqual(navigations, []);
});

test("opening failure keeps the created Trip ID for explicit retry", async () => {
  const navigations: string[] = [];
  const failures: string[] = [];
  await createJourneyAndNavigate(
    draft,
    "原始想法",
    (path) => navigations.push(path),
    (tripId) => failures.push(tripId),
    async () => Response.json({ trip: { id: "trip_123" }, opening: "failed" }, { status: 201 }),
  );
  assert.deepEqual(navigations, []);
  assert.deepEqual(failures, ["trip_123"]);

  const failedState = newTripComposerReducer(createInitialComposerState(), {
    type: "opening.failed", tripId: "trip_123", draft,
  });
  assert.equal(failedState.createdTripId, "trip_123");
  assert.equal(canSubmitTripDraft(failedState), false);
});

test("explicit opening retry navigates without creating a second Journey", async () => {
  const navigations: string[] = [];
  await retryOpeningAndNavigate("trip_123", (path) => navigations.push(path), async (url, init) => {
    assert.equal(url, "/api/trips/trip_123/conversation/initialize");
    assert.equal(init?.method, "POST");
    return Response.json({ message: {
      id: "00000000-0000-4000-8000-000000000002",
      tripId: "trip_123",
      role: "assistant",
      content: "好的，我们开始规划。",
      createdAt: "2026-09-25T01:00:00.000Z",
    } });
  });
  assert.deepEqual(navigations, ["/trips/trip_123"]);
});
