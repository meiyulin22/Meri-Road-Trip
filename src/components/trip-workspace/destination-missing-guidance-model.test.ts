import assert from "node:assert/strict";
import test from "node:test";

import { requestDestinationMissingGuidance } from "./destination-missing-guidance-model";

test("client sends a focused POST and accepts only a persisted assistant message", async () => {
  const message = {
    id: "00000000-0000-4000-8000-000000000001", tripId: "trip-id", role: "assistant",
    content: "还没想好去哪吗？我可以根据你的旅行偏好推荐几个地方。",
    createdAt: "2026-09-25T01:00:00.000Z",
  };
  assert.deepEqual(await requestDestinationMissingGuidance("trip-id", async (input, init) => {
    assert.equal(input, "/api/trips/trip-id/destination-missing-guidance");
    assert.equal(init?.method, "POST");
    assert.equal(init?.body, undefined);
    return Response.json({ message });
  }), message);
  await assert.rejects(() => requestDestinationMissingGuidance("trip-id", async () =>
    Response.json({ message: { ...message, role: "user" } })));
});
