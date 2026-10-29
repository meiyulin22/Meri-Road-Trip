import assert from "node:assert/strict";
import test from "node:test";

import { createPacer, type Clock } from "./request-pacer";

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
