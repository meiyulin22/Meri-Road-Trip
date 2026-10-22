import assert from "node:assert/strict";
import test from "node:test";

import { mapProviderName } from "./map-providers";

test("Amap is the default, Tianditu is chosen by name, and anything else is a configuration error", () => {
  assert.equal(mapProviderName({}), "amap");
  assert.equal(mapProviderName({ MAP_PROVIDER: " " }), "amap");
  assert.equal(mapProviderName({ MAP_PROVIDER: "tianditu" }), "tianditu");
  assert.throws(() => mapProviderName({ MAP_PROVIDER: "google" }), /MAP_PROVIDER must be "amap" or "tianditu"/u);
});
