import assert from "node:assert/strict";
import test from "node:test";

import { createPacer, isAmapRateLimited, withAmapLimits, type Gate } from "./amap-fetch";

const immediate: Gate = { run: (task) => task() };

const limited = { status: "0", info: "CUQPS_HAS_EXCEEDED_THE_LIMIT", infocode: "10021" };

test("the pacer starts tasks at least its interval apart, in the order they asked", async () => {
  let now = 1_000;
  const pauses: number[] = [];
  const pacer = createPacer(350, { now: () => now, sleep: async (ms) => { pauses.push(ms); } });
  const order: number[] = [];
  await Promise.all([1, 2, 3, 4].map((n) => pacer.run(async () => { order.push(n); })));
  assert.deepEqual(order, [1, 2, 3, 4]);
  assert.deepEqual(pauses, [350, 700, 1050]);
  now = 10_000;
  pauses.length = 0;
  await pacer.run(async () => undefined);
  assert.deepEqual(pauses, []);
});

test("a rate-limited answer is retried once after a pause, and the second answer is returned as it is", async () => {
  const answers = [limited, { status: "1", pois: [] }];
  const pauses: number[] = [];
  let calls = 0;
  const fetcher = withAmapLimits(async () => Response.json(answers[calls++]), {
    gate: immediate, sleep: async (ms) => { pauses.push(ms); } });
  const body = await (await fetcher("https://restapi.amap.com/v5/place/text")).json();
  assert.deepEqual(body, { status: "1", pois: [] });
  assert.equal(calls, 2);
  assert.deepEqual(pauses, [1000]);

  calls = 0;
  const stubborn = withAmapLimits(async () => { calls += 1; return Response.json(limited); }, {
    gate: immediate, sleep: async () => undefined });
  assert.deepEqual(await (await stubborn("https://restapi.amap.com/v5/place/text")).json(), limited);
  assert.equal(calls, 2);
});

test("ordinary answers and failures pass straight through without a retry", async () => {
  let calls = 0;
  const fetcher = withAmapLimits(async () => { calls += 1; return Response.json({ status: "0", info: "INVALID_USER_KEY", infocode: "10001" }); },
    { gate: immediate, sleep: async () => { throw new Error("must not pause"); } });
  await fetcher("https://restapi.amap.com/v5/place/text");
  assert.equal(calls, 1);
  assert.equal(isAmapRateLimited({ status: "1" }), false);
  assert.equal(isAmapRateLimited(limited), true);
  assert.equal(isAmapRateLimited({ info: "ACCESS_TOO_FREQUENT" }), true);
});
