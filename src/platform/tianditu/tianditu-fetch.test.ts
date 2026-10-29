import assert from "node:assert/strict";
import test from "node:test";

import type { Gate } from "@/platform/http/request-pacer";

import { createTiandituClient } from "./tianditu-fetch";

/** A gate that runs immediately and records how often it was paused. */
function gate(): Gate & { pauses: number[] } {
  const pauses: number[] = [];
  return {
    pauses,
    run: (task) => task(),
    pause(ms) { pauses.push(ms); },
  };
}

/** Each call gets a fresh Response: a body can only be read once. */
function answering(bodies: Array<() => Response>): typeof fetch & { calls: number } {
  let index = 0;
  const fetcher = (async () => {
    const next = bodies[Math.min(index, bodies.length - 1)];
    index += 1;
    fetcher.calls = index;
    return next();
  }) as unknown as typeof fetch & { calls: number };
  fetcher.calls = 0;
  return fetcher;
}

const ok = () => new Response(JSON.stringify({ count: 1 }), { status: 200 });
const limited = () => new Response(JSON.stringify({ msg: "Too Many Requests" }), { status: 429 });
const firewallPage = () => new Response("<!DOCTYPE html><title>访问被拦截！</title>", { status: 200 });

function withKey(run: () => Promise<void>): Promise<void> {
  const original = process.env.TIANDITU_API_KEY;
  process.env.TIANDITU_API_KEY = "test-tianditu-key";
  return run().finally(() => {
    if (original === undefined) delete process.env.TIANDITU_API_KEY;
    else process.env.TIANDITU_API_KEY = original;
  });
}

test("a 429 cools the queue down and the same request goes first, then answers", async () => {
  await withKey(async () => {
    const pace = gate();
    const fetcher = answering([limited, ok]);
    const answer = await createTiandituClient(fetcher, { gate: pace }).get("/v2/search", { type: "query", postStr: "{}" });
    assert.equal(answer.ok, true);
    assert.equal(fetcher.calls, 2);
    assert.deepEqual(pace.pauses, [1_000]);
  });
});

test("a rate limit that never lifts is a fixed failure, after the bounded retries", async () => {
  await withKey(async () => {
    const pace = gate();
    const fetcher = answering([limited]);
    const answer = await createTiandituClient(fetcher, { gate: pace }).get("/v2/search", {});
    // Four attempts in total: the first request plus three retries.
    assert.equal(fetcher.calls, 4);
    assert.deepEqual(answer, { ok: false, reason: "rate_limited" });
    assert.deepEqual(pace.pauses, [1_000, 1_000, 1_000]);
  });
});

test("418 and a firewall page are refusals, never retried", async () => {
  await withKey(async () => {
    const blocked = answering([() => new Response(JSON.stringify({}), { status: 418 })]);
    assert.deepEqual(await createTiandituClient(blocked, { gate: gate() }).get("/v2/search", {}),
      { ok: false, reason: "refused" });
    assert.equal(blocked.calls, 1);
    const page = answering([firewallPage]);
    assert.deepEqual(await createTiandituClient(page, { gate: gate() }).get("/v2/search", {}),
      { ok: false, reason: "refused" });
    assert.equal(page.calls, 1);
  });
});

test("the key is only sent to Tianditu, and a missing key is a configuration failure", async () => {
  await withKey(async () => {
    let requested: URL | undefined;
    const client = createTiandituClient(async (input) => {
      requested = new URL(String(input));
      return ok();
    }, { gate: gate() });
    await client.get("/v2/search", { type: "query", postStr: "{}" });
    assert.equal(requested?.origin, "https://api.tianditu.gov.cn");
    assert.equal(requested?.searchParams.get("tk"), "test-tianditu-key");
  });
  const original = process.env.TIANDITU_API_KEY;
  delete process.env.TIANDITU_API_KEY;
  try {
    assert.deepEqual(await createTiandituClient(undefined, { gate: gate() }).get("/v2/search", {}),
      { ok: false, reason: "missing_configuration" });
  } finally {
    if (original === undefined) delete process.env.TIANDITU_API_KEY;
    else process.env.TIANDITU_API_KEY = original;
  }
});
