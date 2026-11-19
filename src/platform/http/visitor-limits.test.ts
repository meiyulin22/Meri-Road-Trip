import assert from "node:assert/strict";
import test from "node:test";

import { defaultProviderLimits } from "@/platform/provider-limits";

import { createVisitorLimiters, kimiRequestRefusal } from "./visitor-limits";

const at = (headers: Record<string, string>) => new Request("https://meri.test/api/trip-workspace/messages", { method: "POST", headers });

test("one address gets its hourly Kimi requests, across endpoints and new cookies alike (step 3)", async () => {
  let now = 0;
  const limiters = createVisitorLimiters({ ...defaultProviderLimits, kimiRequestsPerIpPerHour: 2 }, () => now);
  const visitor = { "x-real-ip": "203.0.113.7" };
  assert.equal(kimiRequestRefusal(at(visitor), { limiters }), null);
  assert.equal(kimiRequestRefusal(at(visitor), { limiters, chatGuest: "guest-a" }), null);
  const refused = kimiRequestRefusal(at(visitor), { limiters, chatGuest: "guest-b" });
  assert.equal(refused?.status, 429);
  assert.deepEqual(await refused?.json(), { error: "Too many requests; please slow down and try again later.", code: "too_many_requests" });
  // A forged first x-forwarded-for entry is not the address: the proxy's own header wins.
  assert.equal(kimiRequestRefusal(at({ ...visitor, "x-forwarded-for": "1.2.3.4" }), { limiters })?.status, 429);
  // Another address, or the same one an hour later, goes ahead.
  assert.equal(kimiRequestRefusal(at({ "x-real-ip": "198.51.100.9" }), { limiters }), null);
  now += 60 * 60 * 1_000 + 1;
  assert.equal(kimiRequestRefusal(at(visitor), { limiters }), null);
});

test("one visitor gets its hourly Workspace messages; other Kimi endpoints do not count against it", () => {
  const limiters = createVisitorLimiters({ ...defaultProviderLimits, chatTurnsPerGuestPerHour: 1 });
  assert.equal(kimiRequestRefusal(at({ "x-real-ip": "203.0.113.7" }), { limiters, chatGuest: "guest-a" }), null);
  assert.equal(kimiRequestRefusal(at({ "x-real-ip": "203.0.113.8" }), { limiters, chatGuest: "guest-a" })?.status, 429);
  assert.equal(kimiRequestRefusal(at({ "x-real-ip": "203.0.113.9" }), { limiters }), null);
  assert.equal(kimiRequestRefusal(at({ "x-real-ip": "203.0.113.9" }), { limiters, chatGuest: "guest-b" }), null);
});
