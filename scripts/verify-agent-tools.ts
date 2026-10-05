import { z } from "zod";

import { mastra } from "@/agents";
import { createMoonshotChatModelFromEnvironment } from "@/platform/llm/moonshot-chat-model";

/**
 * The 1.0300 trial: does Kimi call Meri's tools through Mastra, and does each run
 * report what an evaluation will need — steps, tool calls, tokens and time? Every
 * case is a real model and real providers, so the output is read by eye.
 */
const cases = {
  "1": { expect: "resolve-place on 玉龙雪山 (and maybe 丽江) before naming it; no invented prices or hours",
    question: "丽江附近的玉龙雪山值得去吗？先确认一下它在哪。" },
  "2": { expect: "web-search for recent notices about 梅里雪山 / 雨崩, each with source and date; resolve-place too",
    question: "最近去梅里雪山雨崩村徒步有没有封路或者要预约的通知？" },
  "3": { expect: "English reply; resolve-place on 香格里拉 in Chinese, not 'Shangri-La'",
    question: "Is Shangri-La in Yunnan a real city? Where exactly is it?" },
  "4": { expect: "tools AND structured output together — the shape the planner needs: resolve-place still called, then a valid object",
    question: "丽江的玉龙雪山和大理的苍山，分别在哪个市？", structured: true },
} as const;

/** What case 4 must return: Kimi has dropped tool calls before when strict JSON was asked for too. */
const placesAnswer = z.object({
  places: z.array(z.object({
    name: z.string(), province: z.string().nullable(), city: z.string().nullable(),
    verifiedByTool: z.boolean(),
  })),
  unknowns: z.array(z.string()),
});

type Chunk = { readonly type?: string; readonly payload?: Record<string, unknown> } & Record<string, unknown>;

function describeCall(call: Chunk): string {
  const payload = call.payload ?? call;
  return `${String(payload.toolName)}(${JSON.stringify(payload.args ?? payload.input)})`;
}

function describeResult(result: Chunk): string {
  const payload = result.payload ?? result;
  const output = (payload.result ?? payload.output) as Record<string, unknown> | undefined;
  const status = output && typeof output === "object" ? output.status : undefined;
  const count = output && typeof output === "object"
    ? (Array.isArray(output.places) ? output.places.length : Array.isArray(output.results) ? output.results.length : "?")
    : "?";
  return `${String(payload.toolName)} → ${String(status)} (${count})`;
}

async function run(id: keyof typeof cases): Promise<void> {
  const testCase: { readonly structured?: boolean } & (typeof cases)[typeof id] = cases[id];
  const { expect, question } = testCase;
  const agent = mastra.getAgent("scout");
  const startedAt = performance.now();
  let lastStepAt = startedAt;
  const stepTimes: number[] = [];
  const onStepFinish = () => {
    const now = performance.now();
    stepTimes.push(Math.round(now - lastStepAt));
    lastStepAt = now;
  };
  // With the schema on the agent's own calls, Kimi answered straight in JSON, skipped
  // the tool and still claimed verifiedByTool. A separate structuring pass lets the
  // tool loop finish first and only then shapes its answer.
  const result = testCase.structured
    ? await agent.generate(question, { maxSteps: 8, onStepFinish,
      structuredOutput: { schema: placesAnswer, model: createMoonshotChatModelFromEnvironment() } })
    : await agent.generate(question, { maxSteps: 8, onStepFinish });
  const totalMs = Math.round(performance.now() - startedAt);
  process.stdout.write(`\n=== ${id} 「${question}」\nexpect: ${expect}\n`);
  process.stdout.write(`finishReason: ${String(result.finishReason)}  steps: ${result.steps.length}  total: ${totalMs} ms  traceId: ${String(result.traceId)}\n`);
  result.steps.forEach((step, index) => {
    const calls = (step.toolCalls as unknown as Chunk[] | undefined) ?? [];
    const results = (step.toolResults as unknown as Chunk[] | undefined) ?? [];
    process.stdout.write(`  step ${index + 1} (${stepTimes[index] ?? "?"} ms): ${calls.length ? calls.map(describeCall).join(", ") : "no tool call"}${results.length ? `  ⇒ ${results.map(describeResult).join(", ")}` : ""}\n`);
  });
  process.stdout.write(`usage: ${JSON.stringify(result.usage)}\n`);
  process.stdout.write(`reply: ${result.text}\n`);
  if (testCase.structured) {
    const parsed = placesAnswer.safeParse(result.object);
    process.stdout.write(`object (${parsed.success ? "valid" : "INVALID"}): ${JSON.stringify(result.object)}\n`);
  }
}

function isCaseId(value: string | undefined): value is keyof typeof cases {
  return value !== undefined && Object.hasOwn(cases, value);
}

async function main(): Promise<void> {
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
    process.stderr.write("TLS certificate verification is disabled; enable it before running this check.\n");
    process.exitCode = 1;
    return;
  }
  const selected = process.argv[2];
  if (selected !== "all" && !isCaseId(selected)) {
    process.stderr.write(`Usage: NODE_TLS_REJECT_UNAUTHORIZED=1 node --env-file=.env.local --import tsx scripts/verify-agent-tools.ts <all|${Object.keys(cases).join("|")}>\n`);
    process.exitCode = 1;
    return;
  }
  for (const id of selected === "all" ? (Object.keys(cases) as (keyof typeof cases)[]) : [selected]) {
    await run(id);
  }
}

void main().catch((error: unknown) => {
  // Provider errors can carry URLs with keys; print only the kind.
  process.stderr.write(`Agent tool verification failed: ${error instanceof Error ? error.name : "unknown error"}\n`);
  process.exitCode = 1;
});
