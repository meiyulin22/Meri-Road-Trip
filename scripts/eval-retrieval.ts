/**
 * Retrieval eval for Meri's catalog (RAG): for each case in evals/retrieval/cases.json, the city's
 * spots ranked four ways (popularity, vector, preference, interleave) and scored hit@4, recall@4 and
 * recall@12; then evals/retrieval/city-cases.json against the city suggestions of RAG step 4 (a case passes
 * with one expected city in the first four, or, when none is expected, with no suggestion). One query
 * embedding a case, about ¥0.00005 each.
 *
 *   node --env-file=.env.local --import tsx scripts/eval-retrieval.ts [--label name]
 *
 * Needs the catalog imported and embedded, DASHSCOPE_API_KEY and EMBEDDING_BASE_URL.
 */
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";

import { rankCityPreferencesFromEnvironment, readCityCatalogFromEnvironment, recommendCatalogCitiesFromEnvironment } from "@/platform/catalog/catalog-source";

import {
  type CaseScore, cityCasesSchema, rankBy, type Ranker, rankers, retrievalCasesSchema, scoreCityCase, scoreOrder, totals,
} from "./eval-retrieval-score";

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { label: { type: "string" } } });
  // The eval reads the catalog whatever the app's switch says.
  process.env.CATALOG_ENABLED = "true";
  const { cases } = retrievalCasesSchema.parse(JSON.parse(await readFile("evals/retrieval/cases.json", "utf8")));
  const scores: Record<Ranker, CaseScore[]> = { popularity: [], keyword: [], vector: [], preference: [], interleave: [] };
  const perCase: Record<string, Record<Ranker, CaseScore>> = {};

  for (const evalCase of cases) {
    const catalog = await readCityCatalogFromEnvironment(evalCase.province, evalCase.city);
    const rankings = await rankCityPreferencesFromEnvironment(evalCase.province, evalCase.city, evalCase.query);
    if (!catalog || !rankings) throw new Error(`No catalog for ${evalCase.city}.`);
    if (rankings.vector.length === 0) throw new Error(`No vector list for ${evalCase.id}: is 百炼 configured and the catalog embedded?`);
    const idOf = new Map(catalog.spots.map(({ id, name }) => [name, id]));
    const nameOf = (id: string) => catalog.spots.find((spot) => spot.id === id)?.name ?? id;
    const missing = evalCase.relevant.filter((name) => !idOf.has(name));
    if (missing.length > 0) throw new Error(`${evalCase.id}: not in the catalog: ${missing.join("、")}`);
    const relevantIds = evalCase.relevant.map((name) => idOf.get(name) as string);
    perCase[evalCase.id] = Object.fromEntries(rankers.map((ranker) => {
      const score = scoreOrder(rankBy(ranker, catalog.spots, rankings), relevantIds, nameOf);
      scores[ranker].push(score);
      return [ranker, score];
    })) as Record<Ranker, CaseScore>;
    const cell = (ranker: Ranker) => `${perCase[evalCase.id][ranker].recallAt4.toFixed(2)}`;
    process.stdout.write(`${evalCase.id.padEnd(26)} r@4 ${rankers.map(cell).join("  ")} | interleave top4: ${perCase[evalCase.id].interleave.top4.join("、")}\n`);
  }

  const summary = Object.fromEntries(rankers.map((ranker) => [ranker, totals(scores[ranker])]));
  process.stdout.write(`\n${"ranker".padEnd(12)} hit@4  recall@4  recall@12\n`);
  for (const ranker of rankers) {
    const { hitAt4, recallAt4, recallAt12 } = summary[ranker];
    process.stdout.write(`${ranker.padEnd(12)} ${hitAt4.toFixed(2)}   ${recallAt4.toFixed(2)}      ${recallAt12.toFixed(2)}\n`);
  }

  // City recommendations (RAG step 4): what the catalog suggests across the whole country.
  const cityFile = cityCasesSchema.parse(JSON.parse(await readFile("evals/retrieval/city-cases.json", "utf8")));
  const cityScores: Record<string, ReturnType<typeof scoreCityCase>> = {};
  process.stdout.write("\ncity cases\n");
  for (const cityCase of cityFile.cases) {
    const suggested = await recommendCatalogCitiesFromEnvironment(cityCase.query, {});
    const score = scoreCityCase(cityCase.cities, suggested?.map(({ city }) => city) ?? null);
    cityScores[cityCase.id] = score;
    process.stdout.write(`${cityCase.id.padEnd(22)} ${score.passed ? "pass" : "FAIL"} | ${score.top4.join("、") || "(nothing: web search)"}\n`);
  }
  const cityPassed = Object.values(cityScores).filter(({ passed }) => passed).length;
  process.stdout.write(`city cases passed ${cityPassed}/${cityFile.cases.length}\n`);

  const commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
  const date = new Date().toISOString().slice(0, 10);
  const file = `evals/retrieval/results/${date}-${values.label ?? commit}.json`;
  await writeFile(file, `${JSON.stringify({ commit, date, model: process.env.EMBEDDING_MODEL ?? null, summary, cases: perCase, cityPassed, cityCases: cityScores }, null, 2)}\n`);
  process.stdout.write(`\nSaved ${file}\n`);
}

main().then(() => process.exit(0), (error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});
