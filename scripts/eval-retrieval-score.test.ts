import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { CatalogSpot } from "@/domain/catalog/catalog-pick";

import { rankBy, retrievalCasesSchema, scoreOrder, totals } from "./eval-retrieval-score";

const spot = (name: string, sourceCount: number): CatalogSpot => ({
  id: name, name, aliases: [], county: null, summary: "", highlights: [], tags: [], sourceCount, confidence: "high",
});
const spots = [spot("湖", 4), spot("古城", 3), spot("雪山", 1), spot("草甸", 1), spot("寺", 2)];
const rankings = { vector: ["雪山", "草甸", "不在城里"], keyword: ["寺"] };

test("each ranker's order; spots a list leaves out follow by popularity", () => {
  assert.deepEqual(rankBy("popularity", spots, rankings), ["湖", "古城", "寺", "草甸", "雪山"]);
  assert.deepEqual(rankBy("vector", spots, rankings), ["雪山", "草甸", "湖", "古城", "寺"]);
  assert.deepEqual(rankBy("preference", spots, rankings).slice(0, 3), ["雪山", "寺", "草甸"]);
  assert.deepEqual(rankBy("interleave", spots, rankings).slice(0, 4), ["雪山", "寺", "湖", "草甸"]);
});

test("hit@4, recall@4 and recall@12, and their means", () => {
  const order = ["a", "b", "c", "d", "e", "x"];
  const one = scoreOrder(order, ["b", "e"], (id) => id.toUpperCase());
  assert.deepEqual(one, { hitAt4: true, recallAt4: 0.5, recallAt12: 1, top4: ["A", "B", "C", "D"] });
  const none = scoreOrder(order, ["z"], (id) => id);
  assert.deepEqual(totals([one, none]), { hitAt4: 0.5, recallAt4: 0.25, recallAt12: 0.5 });
});

test("the case file is valid", () => {
  const file = retrievalCasesSchema.parse(JSON.parse(readFileSync("evals/retrieval/cases.json", "utf8")));
  assert.equal(new Set(file.cases.map(({ id }) => id)).size, file.cases.length);
});
