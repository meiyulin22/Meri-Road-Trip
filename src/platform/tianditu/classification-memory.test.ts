import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { LocationCandidate } from "@/domain/location/location";

import { ClassificationMemory } from "./classification-memory";

const place: LocationCandidate = {
  providerId: "GEO1", name: "苍山世界地质公园", province: "云南省", city: "大理白族自治州", district: "大理市",
  region: "云南省 大理白族自治州 大理市", address: null, longitude: 100.12, latitude: 25.72,
  coordinateSystem: "CGCS2000", kind: "sight",
};

function tempFile(): string {
  return join(mkdtempSync(join(tmpdir(), "meri-cache-")), "classification.json");
}

test("a page is remembered in memory only when there is no file", () => {
  const memory = new ClassificationMemory(null);
  assert.equal(memory.get("大理白族自治州", "风景名胜"), null);
  memory.set("大理白族自治州", "风景名胜", [place]);
  assert.deepEqual(memory.get("大理白族自治州", "风景名胜"), [place]);
  // An empty answer is not a page worth keeping.
  memory.set("黄山市", "风景名胜", []);
  assert.equal(memory.get("黄山市", "风景名胜"), null);
});

test("a saved page survives a restart, and expires after a week", () => {
  const file = tempFile();
  let now = 1_000_000;
  const first = new ClassificationMemory(file, () => now);
  first.set("黄山市", "风景名胜", [place]);

  const afterRestart = new ClassificationMemory(file, () => now);
  assert.deepEqual(afterRestart.get("黄山市", "风景名胜"), [place]);

  now += 7 * 24 * 60 * 60 * 1_000 + 1;
  assert.equal(new ClassificationMemory(file, () => now).get("黄山市", "风景名胜"), null);
});

test("the oldest page is dropped once there are more than two hundred", () => {
  let now = 1_000_000;
  const memory = new ClassificationMemory(null, () => now);
  for (let index = 0; index < 201; index += 1) {
    now += 1_000;
    memory.set(`区县${index}`, "风景名胜", [place]);
  }
  const stats = memory.stats();
  assert.equal(stats.length, 200);
  assert.equal(memory.get("区县0", "风景名胜"), null);
  assert.deepEqual(memory.get("区县200", "风景名胜"), [place]);
});

test("a file that cannot be parsed is an empty cache, never a failure", () => {
  const file = tempFile();
  writeFileSync(file, "{ this is not json");
  const memory = new ClassificationMemory(file);
  assert.equal(memory.get("大理白族自治州", "风景名胜"), null);
  // And it can still be written to afterwards.
  memory.set("大理白族自治州", "风景名胜", [place]);
  assert.deepEqual(new ClassificationMemory(file).get("大理白族自治州", "风景名胜"), [place]);
});

test("stats describe what is kept, newest first", () => {
  let now = 5_000_000;
  const memory = new ClassificationMemory(null, () => now);
  memory.set("贵阳市", "风景名胜", [place]);
  now += 1_000;
  memory.set("安顺市", "风景名胜", [place, place]);
  assert.deepEqual(memory.stats().map((entry) => [entry.key, entry.count]),
    [["安顺市|风景名胜", 2], ["贵阳市|风景名胜", 1]]);
  assert.equal(memory.stats()[0]?.expiresAt, now + 7 * 24 * 60 * 60 * 1_000);
});
