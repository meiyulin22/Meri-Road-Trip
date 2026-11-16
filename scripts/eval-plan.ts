import { execFileSync } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { Mastra } from "@mastra/core";
import { InMemoryStore } from "@mastra/core/storage";

import { planGenerationDependencies } from "@/agents";
import { createPlanGenerationWorkflow } from "@/agents/workflows/plan-generation";
import { PlanRunService } from "@/capabilities/planning/plan-run-service";
import type { PlanHandoff } from "@/domain/plan/plan-handoff";
import type { PlanProgressEvent } from "@/domain/plan/plan-progress";
import { InMemoryPlanRunRepository } from "@/platform/persistence/in-memory/in-memory-plan-run-repository";

import {
  buildHandoff,
  checkExpectations,
  type EvalCase,
  evalCaseSchema,
  type ExpectationResult,
  measureRun,
  type RunCapture,
  type RunMetrics,
} from "./eval-plan-score";

const casesDir = "evals/plan/cases";
const resultsDir = "evals/plan/results";

type RunReport = {
  readonly caseId: string;
  readonly attempt: number;
  readonly metrics: RunMetrics;
  readonly expectations: readonly ExpectationResult[];
  readonly question: { readonly text: string; readonly options: readonly string[]; readonly answer: string | null } | null;
  /** The plan as a reader checks it: each day's city, date and stops by name. */
  readonly days: readonly { readonly day: number; readonly date: string | null; readonly city: string; readonly stops: readonly string[] }[];
};

/** One run of the workflow as the plan page would start it, kept in memory, with its events collected. */
async function runOnce(evalCase: EvalCase, handoff: PlanHandoff): Promise<{ capture: RunCapture; question: RunReport["question"] }> {
  const repository = new InMemoryPlanRunRepository();
  const workflow = createPlanGenerationWorkflow(planGenerationDependencies({
    saveVersion: (version) => repository.createVersion(version),
  }));
  const mastra = new Mastra({ workflows: { planGeneration: workflow }, storage: new InMemoryStore(), logger: false });
  const service = new PlanRunService({
    repository,
    preferences: { listByTripId: async () => [], create: async () => {} },
    workflow: async () => ({ workflow: mastra.getWorkflow("planGeneration") }),
  });

  const tripId = crypto.randomUUID();
  const started = await service.start(tripId, handoff);
  const run = await repository.findRun(tripId, started.runId);
  if (!run) throw new Error(`The run for case ${evalCase.id} was not recorded.`);
  const events: PlanProgressEvent[] = [];
  let question: RunReport["question"] = null;
  let after = 0;
  for (;;) {
    let waiting: { id: string; choice: string | null } | null = null;
    for await (const { seq, event } of service.follow(run, after, new AbortController().signal)) {
      events.push(event);
      after = seq;
      if (event.type !== "run.waiting") continue;
      const options = event.question.options.map(({ label }) => label);
      const choice = evalCase.answer === "decide" ? null : options[Math.min(evalCase.answer, options.length - 1)];
      waiting = { id: event.question.id, choice };
      question = { text: event.question.text, options, answer: choice };
    }
    if (!waiting) break;
    await service.answer(tripId, run.id, { questionId: waiting.id, choice: waiting.choice });
  }
  const finished = repository.runs.get(started.runId) ?? null;
  return { capture: { events, run: finished, plan: repository.versions[0]?.plan ?? null }, question };
}

function daysOf(capture: RunCapture): RunReport["days"] {
  const plan = capture.plan;
  if (!plan) return [];
  const names = new Map(plan.spots.map(({ id, name }) => [id, name]));
  return plan.draft.days.map(({ day, date, city, stops }) => ({
    day, date, city, stops: stops.map(({ spotId, slot }) => `${names.get(spotId) ?? spotId} (${slot})`),
  }));
}

async function loadCases(filters: readonly string[]): Promise<EvalCase[]> {
  const files = (await readdir(casesDir)).filter((file) => file.endsWith(".json")).sort();
  const cases = await Promise.all(files.map(async (file) =>
    evalCaseSchema.parse(JSON.parse(await readFile(join(casesDir, file), "utf8")))));
  return filters.length === 0 ? cases : cases.filter(({ id }) => filters.some((filter) => id.startsWith(filter)));
}

const seconds = (ms: number | null | undefined) => ms === null || ms === undefined ? "–" : (ms / 1000).toFixed(0);

function summaryLine(report: RunReport): string {
  const { metrics: m, expectations } = report;
  const passed = expectations.filter(({ passed }) => passed).length;
  return [
    `${report.caseId}#${report.attempt}`, m.status, `${seconds(m.durationMs)}s`,
    `tok ${m.inputTokens ?? "–"}/${m.outputTokens ?? "–"}`, `search ${m.searches.research}+${m.searches.verify}`,
    `map ${m.mapLookups ?? "–"}`, `stops ${m.days.stops}/${m.days.total}d`,
    `requested ${m.requested.scheduled}/${m.requested.total}`,
    `checks o${m.checks.open} p${m.checks.partial} c${m.checks.closed} u${m.checks.uncertain} x${m.checks.unchecked}`,
    `booking ${m.reservations}`, `conflicts ${Object.values(m.conflicts).reduce((sum, count) => sum + count, 0)}`,
    `asked ${m.asked ? "yes" : "no"}`, `expect ${passed}/${expectations.length}`,
  ].join(" | ");
}

/**
 * Runs the evaluation cases through the real plan workflow, one run at a time, and writes
 * every run's numbers and expectation results to evals/plan/results. Tianditu is called
 * through the map check: the first run whose map check stopped ends the whole evaluation,
 * since a failed Tianditu call is never retried.
 */
async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { label: { type: "string" }, repeat: { type: "string" } },
  });
  const cases = await loadCases(positionals);
  if (cases.length === 0) {
    process.stderr.write("No evaluation case matches.\n");
    process.exitCode = 1;
    return;
  }
  const repeatOverride = values.repeat ? Number(values.repeat) : null;
  const commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
  const referenceDate = new Date().toISOString().slice(0, 10);
  const label = values.label ?? commit;
  const startedAt = new Date().toISOString();
  const reports: RunReport[] = [];
  let stopped: string | null = null;

  for (const evalCase of cases) {
    const handoff = buildHandoff(evalCase, referenceDate);
    for (let attempt = 1; attempt <= (repeatOverride ?? evalCase.repeat) && !stopped; attempt += 1) {
      process.stderr.write(`▶ ${evalCase.id} #${attempt}: ${evalCase.title}\n`);
      const { capture, question } = await runOnce(evalCase, handoff);
      const report: RunReport = {
        caseId: evalCase.id, attempt, metrics: measureRun(capture, handoff),
        expectations: checkExpectations(evalCase, capture, handoff), question, days: daysOf(capture),
      };
      reports.push(report);
      process.stderr.write(summaryLine(report) + "\n");
      for (const failed of report.expectations.filter(({ passed }) => !passed)) {
        process.stderr.write(`   ✗ ${failed.name}: ${failed.detail}\n`);
      }
      if (report.metrics.mapStopped) stopped = `Tianditu stopped during ${evalCase.id}; the evaluation ends here, no retry.`;
      if (report.metrics.errorCode === "planner_unavailable") stopped = `Kimi could not be reached during ${evalCase.id}.`;
    }
    if (stopped) break;
  }

  await mkdir(resultsDir, { recursive: true });
  const file = join(resultsDir, `${referenceDate}-${label}.json`);
  await writeFile(file, JSON.stringify({
    label, commit, referenceDate, startedAt, finishedAt: new Date().toISOString(), stopped,
    cases: cases.map(({ id }) => id), runs: reports,
  }, null, 2) + "\n");
  process.stderr.write(`\n${reports.map(summaryLine).join("\n")}\n\nSaved ${file}\n`);
  if (stopped) {
    process.stderr.write(stopped + "\n");
    process.exitCode = 2;
  }
}

void main().catch((error: unknown) => {
  process.stderr.write("Plan evaluation failed (" + (error instanceof Error ? error.name : "unknown error") + ").\n");
  process.exitCode = 1;
});
