import assert from "node:assert/strict";
import test from "node:test";

import type { LocationSuggestion } from "@/domain/location/location-suggestion";

import { GettingThereRequestError, pickableSuggestion, requestGettingThere } from "./plan-getting-there-model";

const hongqiao: LocationSuggestion = {
  provider: "tianditu", providerId: null, name: "上海虹桥站", region: "上海市闵行区", adcode: "310112", address: null,
  coordinates: { longitude: 121.32, latitude: 31.19, coordinateSystem: "CGCS2000" },
};

test("only a Tianditu suggestion with its point can be picked (1.2107)", () => {
  assert.ok(pickableSuggestion(hongqiao));
  assert.ok(!pickableSuggestion({ ...hongqiao, coordinates: null }));
  assert.ok(!pickableSuggestion({ ...hongqiao, provider: "amap", coordinates: { longitude: 121.3, latitude: 31.2, coordinateSystem: "GCJ-02" } }));
});

test("the picked place and the choice are sent; a refusal is told by its code", async () => {
  const sent: unknown[] = [];
  const refusing = async (_url: RequestInfo | URL, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body)));
    return Response.json({ error: { code: "already_filled", message: "" } }, { status: 409 });
  };
  await assert.rejects(requestGettingThere("trip", hongqiao, "train", refusing),
    (error: unknown) => error instanceof GettingThereRequestError && error.reason === "already_filled");
  assert.deepEqual(sent, [{ origin: { name: "上海虹桥站", region: "上海市闵行区", coordinates: hongqiao.coordinates }, choice: "train" }]);
  const failing = async () => new Response("", { status: 502 });
  await assert.rejects(requestGettingThere("trip", hongqiao, null, failing),
    (error: unknown) => error instanceof GettingThereRequestError && error.reason === "failed");
});

test("a trip with an origin sends the way of travelling alone (1.2115)", async () => {
  let sent: unknown = null;
  await requestGettingThere("trip-1", null, "flight", async (_url, init) => {
    sent = JSON.parse(String(init?.body));
    return Response.json({}, { status: 500 });
  }).catch(() => {});
  assert.deepEqual(sent, { origin: null, choice: "flight" });
});
