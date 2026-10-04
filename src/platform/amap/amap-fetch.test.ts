import assert from "node:assert/strict";
import test from "node:test";

import { createPacer, isAmapRateLimited, withAmapLimits, type Clock, type Gate } from "./amap-fetch";

const limited = { status: "0", info: "CUQPS_HAS_EXCEEDED_THE_LIMIT", infocode: "10021" };
const url = "https://restapi.amap.com/v5/place/text";

/**
 * Time only moves when the code under test sleeps, and only after everything already
 * started has had its chance to run — as it would under a real clock.
 */
function fakeClock(start = 1_000): Clock & { time: number } {
  const clock = {
    time: start,
    now: () => clock.time,
    sleep: async (ms: number) => {
      await new Promise((resolve) => setImmediate(resolve));
      clock.time += ms;
    },
  };
  return clock;
}

/** Runs every task at once, and remembers pauses and who asked to go first. */
function recordingGate(): Gate & { pauses: number[]; firsts: boolean[] } {
  const gate = {
    pauses: [] as number[],
    firsts: [] as boolean[],
    run<T>(task: () => Promise<T>, options: { readonly first?: boolean } = {}) {
      gate.firsts.push(options.first ?? false);
      return task();
    },
    pause(ms: number) { gate.pauses.push(ms); },
  };
  return gate;
}

test("the pacer starts tasks at least its interval apart, in the order they asked", async () => {
  const clock = fakeClock();
  const pacer = createPacer(350, clock);
  const starts: [number, number][] = [];
  await Promise.all([1, 2, 3, 4].map((n) => pacer.run(async () => { starts.push([n, clock.time]); })));
  assert.deepEqual(starts, [[1, 1_000], [2, 1_350], [3, 1_700], [4, 2_050]]);

  clock.time = 10_000;
  await pacer.run(async () => { starts.push([5, clock.time]); });
  assert.deepEqual(starts.at(-1), [5, 10_000]);
});

test("a pause holds back the tasks already waiting, and a task asking to go first jumps the queue", async () => {
  const clock = fakeClock();
  const pacer = createPacer(350, clock);
  const starts: [string, number][] = [];
  const first = pacer.run(async () => {
    starts.push(["a", clock.time]);
    pacer.pause(1_000);
  });
  const queued = ["b", "c"].map((name) => pacer.run(async () => { starts.push([name, clock.time]); }));
  const retry = pacer.run(async () => { starts.push(["retry", clock.time]); }, { first: true });
  await Promise.all([first, ...queued, retry]);
  assert.deepEqual(starts, [["a", 1_000], ["retry", 2_000], ["b", 2_350], ["c", 2_700]]);
});

test("a refused request pauses the queue and retries at the front, up to three times", async () => {
  const answers = [limited, limited, { status: "1", pois: [] }];
  let calls = 0;
  const gate = recordingGate();
  const fetcher = withAmapLimits(async () => Response.json(answers[calls++]), { timeoutMs: 6_000, gate });
  assert.deepEqual(await (await fetcher(url)).json(), { status: "1", pois: [] });
  assert.equal(calls, 3);
  assert.deepEqual(gate.pauses, [1_000, 1_000]);
  assert.deepEqual(gate.firsts, [false, true, true]);

  calls = 0;
  const stubbornGate = recordingGate();
  const stubborn = withAmapLimits(async () => { calls += 1; return Response.json(limited); },
    { timeoutMs: 6_000, gate: stubbornGate });
  assert.deepEqual(await (await stubborn(url)).json(), limited);
  assert.equal(calls, 4);
  assert.equal(stubbornGate.pauses.length, 3);
});

test("the timeout starts when the request is sent, not while it waits its turn", async () => {
  // A turn that takes longer to come than the whole timeout, as the twelfth photo's did.
  const slowGate: Gate = {
    async run(task) {
      await new Promise((resolve) => setTimeout(resolve, 60));
      return task();
    },
    pause() {},
  };
  let abortedWhenSent: boolean | undefined;
  let signal: AbortSignal | null | undefined;
  const fetcher = withAmapLimits(async (_input, init) => {
    signal = init?.signal;
    abortedWhenSent = signal?.aborted;
    return Response.json({ status: "1" });
  }, { timeoutMs: 30, gate: slowGate });
  await fetcher(url);
  assert.equal(abortedWhenSent, false);
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(signal?.aborted, true);
});

test("ordinary answers and failures pass straight through without a retry", async () => {
  let calls = 0;
  const gate = recordingGate();
  const fetcher = withAmapLimits(async () => { calls += 1; return Response.json({ status: "0", info: "INVALID_USER_KEY", infocode: "10001" }); },
    { timeoutMs: 6_000, gate });
  await fetcher(url);
  assert.equal(calls, 1);
  assert.deepEqual(gate.pauses, []);
  assert.equal(isAmapRateLimited({ status: "1" }), false);
  assert.equal(isAmapRateLimited(limited), true);
  assert.equal(isAmapRateLimited({ info: "ACCESS_TOO_FREQUENT" }), true);
});
