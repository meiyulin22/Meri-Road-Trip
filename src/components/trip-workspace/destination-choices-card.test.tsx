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
  const props = { areas, active: true, pending: false, error: false, onCommit: () => {} };
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

test("historical repeated POIs render one city preference instead of indistinguishable disabled spots", async () => {
  const { DestinationChoicesCard } = await import("./destination-choices-card");
  const { groupDestinationChoices } = await import("@/domain/trip-message/destination-choice-identity");
  const choices = ["a", "b", "c"].map((id) => ({ id, name: "梅里雪山", province: "云南省",
    city: "迪庆藏族自治州", spot: "梅里雪山", detail: "德钦县" }));
  const grouped = groupDestinationChoices(choices);
  assert.equal(grouped.length, 1);
  assert.deepEqual(grouped[0].ids, ["a", "b", "c"]);
  const markup = renderToStaticMarkup(createElement(DestinationChoicesCard, {
    areas: [], active: true, pending: false, error: false, onCommit: () => {},
    presentation: { type: "destination_choices", mode: "replace", choices },
  }));
  assert.equal((markup.match(/type="checkbox"/g) ?? []).length, 1);
  assert.match(markup, /迪庆藏族自治州/);
  assert.match(markup, /想去：梅里雪山/);
  assert.doesNotMatch(markup, /请细化搜索|德钦县/);
  assert.doesNotMatch(markup.match(/<input[^>]*>/)?.[0] ?? "", /disabled/);
});


test("a historical replacement card has disabled checkboxes and submission", async () => {
 const { DestinationChoicesCard } = await import("./destination-choices-card");
 const markup=renderToStaticMarkup(createElement(DestinationChoicesCard,{
  active:false,areas:[],pending:false,error:false,onCommit:()=>{throw new Error("historical card submitted");},
  presentation:{type:"destination_choices",mode:"replace",choices:[
   {id:"city",name:"迪庆藏族自治州",province:"云南省",city:"迪庆藏族自治州",spot:"梅里雪山"},
  ]},
 }));
 assert.match(markup.match(/<input[^>]*>/)?.[0]??"",/disabled/);
 assert.match(markup.match(/<button[^>]*>/)?.[0]??"",/disabled/);
 assert.match(markup,/历史选项，仅供查看/);
 assert.match(markup,/想去：梅里雪山/);
});

test("a place already in the Journey stays checked and marked after the batch is added", async () => {
  const { DestinationChoicesCard } = await import("./destination-choices-card");
  const areas = [{ province: "云南省", places: [{ name: "昆明市", spots: [] }] }];
  const presentation = { type: "destination_choices", mode: "add", choices: [
    { id: "kunming", name: "昆明市", province: "云南省", city: "昆明市" },
    { id: "dali", name: "大理白族自治州", province: "云南省", city: "大理白族自治州" },
  ] } as const;
  for (const active of [true, false]) {
    const markup = renderToStaticMarkup(createElement(DestinationChoicesCard, {
      areas, active, pending: false, error: false, onCommit: () => {}, presentation,
    }));
    const [kunming, dali] = markup.match(/<input[^>]*>/g) ?? [];
    assert.match(kunming ?? "", /checked/);
    assert.match(kunming ?? "", /disabled/);
    assert.doesNotMatch(dali ?? "", /checked/);
    assert.equal((markup.match(/已在行程/g) ?? []).length, 1);
    assert.doesNotMatch(markup, /已添加/);
  }
});

test("a card pulses while its photo is looked up, and shows the pin once there is none", async () => {
  const { DestinationChoicesCard } = await import("./destination-choices-card");
  const props = { areas: [], active: true, pending: false, error: false, onCommit: () => {},
    presentation: { type: "destination_choices" as const, mode: "add" as const, choices: [
      { id: "lj", name: "丽江市", province: "云南省" }, { id: "dl", name: "大理白族自治州", province: "云南省" }] } };
  const looking = renderToStaticMarkup(createElement(DestinationChoicesCard, { ...props, photoPendingIds: ["lj"] }));
  assert.equal((looking.match(/aria-busy="true"/g) ?? []).length, 1);
  assert.equal((looking.match(/lucide-map-pin/g) ?? []).length, 1);
  const settled = renderToStaticMarkup(createElement(DestinationChoicesCard, props));
  assert.doesNotMatch(settled, /aria-busy/);
  assert.equal((settled.match(/lucide-map-pin/g) ?? []).length, 2);
});
