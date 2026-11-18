import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { parseLabelledLiteral, parsePythonLiteral } from "./python-literal";

test("VariFlight's printed Python dict reads as data, and only as data (1.2111)", () => {
  assert.deepEqual(parsePythonLiteral(`{'a': 1, "b": [True, False, None], 'c': (1.5, -2), 'd': 'it\\'s 上海', 'e': {}}`),
    { a: 1, b: [true, false, null], c: [1.5, -2], d: "it's 上海", e: {} });
  assert.deepEqual(parsePythonLiteral("[1, 2,]"), [1, 2]);
  assert.throws(() => parsePythonLiteral("__import__('os')"));
  assert.throws(() => parsePythonLiteral("{'a': 1} extra"));
  assert.throws(() => parseLabelledLiteral("no data here"));
});

test("the recorded answer for 上海 → 丽江 on 2026-12-21 parses whole", () => {
  const text = readFileSync(join(import.meta.dirname, "fixtures", "variflight-sha-ljg-2026-12-21.txt"), "utf8");
  const parsed = parseLabelledLiteral(text) as { code: number; data: { flightno: string }[] };
  assert.equal(parsed.code, 200);
  assert.deepEqual(parsed.data.map(({ flightno }) => flightno).sort(), ["9C6617", "9C6733", "9C7115", "CA8559", "JD5666"]);
});
