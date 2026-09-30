import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const nodeRequire = createRequire(import.meta.url);
nodeRequire.extensions[".css"] = (module) => {
  module.exports = { default: new Proxy({}, { get: (_target, key) => String(key) }) };
};

test("an existing city still permits adding a new spot and replacement can select an existing city", async () => {
  const { DestinationChoicesCard } = await import("./destination-choices-card");
  const areas = [{ province: "云南省", places: [{ name: "迪庆藏族自治州", spots: ["梅里雪山"] }] }];
  const props = { areas, pending: false, error: false, onCommit: () => {} };
  const addition = renderToStaticMarkup(createElement(DestinationChoicesCard, { ...props,
    presentation: { type: "destination_choices", mode: "add", choices: [
      { id: "new-spot", name: "普达措", province: "云南省", city: "迪庆藏族自治州", spot: "普达措" },
    ] } }));
  assert.doesNotMatch(addition.match(/<input[^>]*>/)?.[0] ?? "", /disabled/);
  assert.match(addition, /添加所选/);
  assert.equal((addition.match(/<button\b/g) ?? []).length, 1);
  const replacement = renderToStaticMarkup(createElement(DestinationChoicesCard, { ...props,
    presentation: { type: "destination_choices", mode: "replace", choices: [
      { id: "city", name: "迪庆藏族自治州", province: "云南省", city: "迪庆藏族自治州" },
    ] } }));
  assert.doesNotMatch(replacement.match(/<input[^>]*>/)?.[0] ?? "", /disabled/);
  assert.match(replacement, /替换为所选目的地/);
});
