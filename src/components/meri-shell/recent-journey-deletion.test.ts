import assert from "node:assert/strict";
import test from "node:test";

import { requestRecentJourneyDeletion, requestRecentJourneyDeletionOnce } from "./recent-journey-deletion";

test("Home deletion uses the existing owner-scoped DELETE endpoint", async () => {
  let calls = 0;
  await requestRecentJourneyDeletion("trip 1", async (input, init) => {
    calls += 1;
    assert.equal(input, "/api/trips/trip%201");
    assert.equal(init?.method, "DELETE");
    assert.equal(init?.body, undefined);
    return new Response(null, { status: 204 });
  });
  assert.equal(calls, 1);
});

test("a failed DELETE does not report success and remains retryable", async () => {
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    return calls === 1
      ? Response.json({ error: "failed" }, { status: 500 })
      : new Response(null, { status: 204 });
  };
  await assert.rejects(requestRecentJourneyDeletion("trip-1", fetcher));
  await requestRecentJourneyDeletion("trip-1", fetcher);
  assert.equal(calls, 2);
});

test("a pending Home deletion cannot submit a second DELETE", async () => {
  const pending = { current: false };
  let complete!: (response: Response) => void;
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    return new Promise<Response>((resolve) => { complete = resolve; });
  };
  const first = requestRecentJourneyDeletionOnce("trip-1", pending, fetcher);
  assert.equal(pending.current, true);
  assert.equal(await requestRecentJourneyDeletionOnce("trip-1", pending, fetcher), false);
  assert.equal(calls, 1);
  complete(new Response(null, { status: 204 }));
  assert.equal(await first, true);
  assert.equal(pending.current, false);
});
