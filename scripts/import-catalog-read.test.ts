import assert from "node:assert/strict";
import test from "node:test";

import { countChanges, readCatalog } from "./import-catalog-read";

const line = (id: string, overrides: Record<string, unknown> = {}) => JSON.stringify({
  schema_version: 1,
  id,
  kind: "tip",
  name: id,
  aliases: [],
  location: { province: "云南省", prefecture: "测试州", county: null },
  summary: "提示。",
  tags: ["旅行提示"],
  details: { applies_in: "全年", advice: "带伞" },
  related: [],
  historical: null,
  source_refs: [{ document_id: "guide_a", pdf_pages: [1], guide_year: null }],
  confidence: "high",
  identity_check: null,
  ...overrides,
});

const file = (text: string, path = "/x/data/cities/云南省-测试州.ndjson") => ({ path, text });

test("valid lines become rows; blank lines are skipped", () => {
  const read = readCatalog([file(`${line("tip_a")}\n\n${line("tip_b")}\n`)]);
  assert.deepEqual(read.problems, []);
  assert.deepEqual(read.rows.map((row) => row.id), ["tip_a", "tip_b"]);
});

test("bad JSON, schema errors, a wrong city and duplicate ids are problems with their line", () => {
  const read = readCatalog([file([
    "{not json",
    line("tip_c", { confidence: "sure" }),
    line("tip_d", { location: { province: "云南省", prefecture: "别的州", county: null } }),
    line("tip_e"),
    line("tip_e"),
  ].join("\n"))]);
  assert.equal(read.problems.length, 4);
  assert.match(read.problems[0], /测试州\.ndjson:1: not JSON/);
  assert.match(read.problems[1], /:2: confidence/);
  assert.match(read.problems[2], /:3: tip_d is in 云南省-别的州/);
  assert.equal(read.problems[3], "tip_e appears more than once");
});

test("an unknown spot tag stops the import", () => {
  const spot = line("spot_a", {
    kind: "spot",
    tags: ["外星基地"],
    details: {
      highlights: [], suggested_hours: null, best_season: null, visit_note: null,
      walking: { distance_m: null, terrain: null, stairs: null },
    },
  });
  const read = readCatalog([file(spot)]);
  assert.deepEqual(read.problems.map((problem) => problem.replace(/^.*: spot_a/, "spot_a")), ["spot_a has tags the mapping does not know: 外星基地"]);
});

test("a link to a missing entry is a warning only; no files at all is a problem", () => {
  const read = readCatalog([file(line("tip_f", { related: [{ id: "spot_gone", relation: "applies_to" }] }))]);
  assert.deepEqual(read.problems, []);
  assert.deepEqual(read.warnings, ["tip_f is related to spot_gone, which is not in the catalog"]);
  assert.deepEqual(readCatalog([]).problems, ["no city files found"]);
  assert.match(readCatalog([file(line("tip_g"), "/x/云南省.ndjson")]).problems[0], /not <省>-<州或市>/);
});

test("changes are counted against the ids already in the table", () => {
  const { rows } = readCatalog([file(`${line("tip_a")}\n${line("tip_b")}`)]);
  assert.deepEqual(countChanges(new Set(["tip_a", "tip_old"]), rows), { added: 1, updated: 1, removed: 1 });
});
