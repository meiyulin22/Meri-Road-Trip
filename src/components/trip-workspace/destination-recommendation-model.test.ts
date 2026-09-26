import assert from "node:assert/strict";
import test from "node:test";

import { requestDestinationRecommendations } from "./destination-recommendation-model";

const result = {
  reply: "先看看这三个方向。",
  destinations: [
    { name: "甲", region: null, reason: "方向一" },
    { name: "乙", region: "四川", reason: "方向二" },
    { name: "丙", region: null, reason: "方向三" },
  ],
};

test("button client posts without a synthetic user message and validates result", async () => {
  const received = await requestDestinationRecommendations("trip 1", async (input, init) => {
    assert.equal(input, "/api/trips/trip%201/destination-recommendations");
    assert.equal(init?.method, "POST");
    assert.equal(init?.body, undefined);
    return Response.json(result);
  });
  assert.deepEqual(received, result);
});

test("client rejects failed and invalid recommendation responses", async () => {
  await assert.rejects(requestDestinationRecommendations("trip", async () =>
    Response.json({ error: "failed" }, { status: 502 })));
  await assert.rejects(requestDestinationRecommendations("trip", async () =>
    Response.json({ ...result, destinations: result.destinations.slice(0, 2) })));
});
