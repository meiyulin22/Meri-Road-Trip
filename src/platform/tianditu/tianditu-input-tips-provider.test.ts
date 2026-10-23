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

test("government offices and places outside China drop out, and administrative names come first", async () => {
  // The 大理 list Tianditu's own site shows, plus the foreign entry the input 大 brings back.
  const payload = [
    { name: "大理", lonlat: "119.03,29.15", gbCode: "156330803", address: "浙江省衢州市衢江区" },
    { name: "大理白族自治州", lonlat: "100.22,25.6", gbCode: "156532900", address: "云南省大理白族自治州大理市" },
    { name: "大理市", lonlat: "100.26,25.6", gbCode: "156532901", address: "云南省大理白族自治州大理市" },
    { name: "大理白族自治州政府", lonlat: "100.22,25.6", gbCode: "156532900", address: "云南省大理白族自治州大理市" },
    { name: "大理镇人大", lonlat: "100.16,25.69", gbCode: "156532901", address: "云南省大理白族自治州大理市" },
    { name: "大理市委", lonlat: "100.22,25.6", gbCode: "156532900", address: "云南省大理白族自治州大理市" },
    { name: "大理市水务局", lonlat: "100.22,25.6", gbCode: "156532900", address: "云南省大理白族自治州大理市" },
    { name: "大理市史志办", lonlat: "100.22,25.6", gbCode: "156532900", address: "云南省大理白族自治州大理市" },
    { name: "大马士革", lonlat: "36.31,33.51", gbCode: "", address: "" },
  ];
  const result = await new TiandituInputTipsProvider(client({ ok: true, body: { suggests: payload } })).suggest("大理");
  // Both real places first, the shorter name (大理市) ahead of the longer region, then the
  // villages that share the name; every office and the foreign entry are gone.
  assert.deepEqual(result.status === "success" && result.suggestions.map((suggestion) => suggestion.name),
    ["大理市", "大理白族自治州", "大理"]);
});

test("a longer input puts the place itself ahead of the shops that contain it", async () => {
  const payload = [
    { name: "大理古榕超市", lonlat: "100.16,25.69", gbCode: "156532901", address: "云南省大理白族自治州大理市" },
    { name: "大理古城维护费稽查大队", lonlat: "100.16,25.69", gbCode: "156532901", address: "云南省大理白族自治州大理市" },
    { name: "大理古城", lonlat: "100.16,25.69", gbCode: "156532901", address: "云南省大理白族自治州大理市" },
  ];
  const result = await new TiandituInputTipsProvider(client({ ok: true, body: { suggests: payload } })).suggest("大理古");
  assert.deepEqual(result.status === "success" && result.suggestions.map((suggestion) => suggestion.name),
    ["大理古城", "大理古榕超市", "大理古城维护费稽查大队"]);
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
