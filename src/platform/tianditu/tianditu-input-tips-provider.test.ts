import assert from "node:assert/strict";
import test from "node:test";

import type { TiandituAnswer, TiandituClient } from "./tianditu-fetch";
import { suggestionFromTianditu, TiandituInputTipsProvider } from "./tianditu-input-tips-provider";

function client(answer: TiandituAnswer): TiandituClient {
  return { get: async () => answer };
}

test("a Tianditu suggestion becomes a Meri suggestion with a six-digit adcode and CGCS2000 point", () => {
  // As Tianditu answered 「大理古」 on 2026-10-22.
  assert.deepEqual(suggestionFromTianditu({
    gbCode: "156532901", address: "云南省大理白族自治州大理市", name: "大理古城", lonlat: "100.16038,25.69842",
  }), {
    provider: "tianditu", providerId: null, name: "大理古城", region: "云南省大理白族自治州大理市", adcode: "532901",
    address: null, coordinates: { longitude: 100.16038, latitude: 25.69842, coordinateSystem: "CGCS2000" },
  });
  assert.equal(suggestionFromTianditu({ name: "  " }), null);
  assert.equal(suggestionFromTianditu({ name: "无坐标", lonlat: "x" })?.coordinates, null);
});

test("suggestions, an empty answer and failures come back as the service expects", async () => {
  const found = await new TiandituInputTipsProvider(client({ ok: true, body: {
    resultType: "4", suggests: [{ name: "大理古城", lonlat: "100.16,25.69", gbCode: "156532901" }],
  } })).suggest("大理古");
  assert.equal(found.status === "success" && found.suggestions[0].name, "大理古城");
  assert.deepEqual(await new TiandituInputTipsProvider(client({ ok: true, body: { count: 0 } })).suggest("zz"),
    { status: "success", suggestions: [] });
  assert.deepEqual(await new TiandituInputTipsProvider(client({ ok: false, reason: "timeout" })).suggest("大理"),
    { status: "failure", reason: "timeout" });
  assert.deepEqual(await new TiandituInputTipsProvider(client({ ok: false, reason: "refused" })).suggest("大理"),
    { status: "failure", reason: "upstream_error" });
  assert.deepEqual(await new TiandituInputTipsProvider(client({ ok: true, body: { suggests: [{ name: "" }] } })).suggest("大理"),
    { status: "failure", reason: "malformed_response" });
});
