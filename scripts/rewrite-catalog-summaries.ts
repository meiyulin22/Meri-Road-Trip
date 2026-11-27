/**
 * Rewrites the catalog's 「攻略介绍…」 summaries in Meri's own voice (B2, agreed with merlin 2026-11-27).
 *
 *   node --env-file=.env.local --import tsx scripts/rewrite-catalog-summaries.ts [--dry-run] [--batches N] [--max-yuan 10]
 *   ... --export pending.ndjson                    the summaries still to rewrite, for writing them elsewhere
 *   ... --check drafts.ndjson                      run the checks on {"id","summary"} lines; writes nothing
 *   ... --apply drafts.ndjson --source "<who>"     check and record them like Kimi's answers
 *
 * merlin chose 2026-11-27 to have Claude write the rewrites in the session (--export / --apply) rather
 * than pay Kimi about ¥14; the Kimi path is kept, as measured by its one pilot call (¥0.29 for 30).
 *
 * Reads CATALOG_DIR (the private meri-catalog-cn repo) and its local OCR (.work/, never sent anywhere).
 * Sends Kimi only each entry's kind, name, city and summary, 30 at a time. Every answer goes through
 * the code checks in src/domain/catalog/summary-voice.ts; a pass is appended to
 * data/enrichment/summaries.ndjson, a failure to data/enrichment/summaries-rejected.ndjson with its
 * reasons, and the entry keeps its original summary. The catalog's own files are never changed.
 *
 * Resumable: entries already in either file are skipped. The money is metered from each answer's
 * usage, and the run stops before a call that could pass --max-yuan. scripts/import-catalog.ts merges
 * the file; scripts/embed-catalog.ts then re-embeds the changed rows.
 */
import { appendFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";

import OpenAI from "openai";

import { summaryFingerprint } from "@/domain/catalog/catalog-enrichment";
import { type CatalogEntry, catalogEntrySchema } from "@/domain/catalog/catalog-entry";
import { checkVoiceRewrite, hanOnly, placeNameVocabulary } from "@/domain/catalog/summary-voice";
import { kimiCostFen, usageOf } from "@/platform/llm/kimi-spend";
import { DEFAULT_MOONSHOT_BASE_URL, moonshotRequestBody, reasoningEffortFromEnvironment } from "@/platform/llm/moonshot-chat-model";
import { paidCallsEnabled } from "@/platform/provider-limits";

import {
  needsVoiceRewrite,
  parseVoiceAnswers,
  type VoiceAnswer,
  voiceBatches,
  voiceResponseJsonSchema,
  voiceSystemPrompt,
  voiceUserMessage,
} from "./rewrite-catalog-summaries-batch";

const batchSize = 30;
const requestTimeoutMs = 240_000;
const today = new Date().toISOString().slice(0, 10);

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not set; add it to .env.local.`);
  return value;
}

const readLines = async (path: string): Promise<unknown[]> => {
  try {
    return (await readFile(path, "utf8")).split("\n").filter((line) => line.trim()).map((line) => JSON.parse(line) as unknown);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
};

async function readEntries(catalogDir: string): Promise<CatalogEntry[]> {
  const citiesDir = join(catalogDir, "data", "cities");
  const names = (await readdir(citiesDir)).filter((name) => name.endsWith(".ndjson")).sort();
  const entries: CatalogEntry[] = [];
  for (const name of names) {
    for (const line of await readLines(join(citiesDir, name))) entries.push(catalogEntrySchema.parse(line));
  }
  return entries;
}

/** document_id → page number → Han text, from the local OCR the catalog was extracted from. */
async function readOcr(catalogDir: string): Promise<Map<string, Map<number, string>>> {
  const work = join(catalogDir, ".work");
  const folders = (await readdir(join(work, "ocr"))).map((name) => join(work, "ocr", name));
  folders.push(join(work, "dali"));
  const documents = new Map<string, Map<number, string>>();
  for (const folder of folders) {
    let meta: { document_id: string };
    try {
      meta = JSON.parse(await readFile(join(folder, "source.json"), "utf8")) as { document_id: string };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    const pages = new Map<number, string>();
    for (const page of await readLines(join(folder, "ocr.ndjson")) as { page: number; lines: { text: string }[] }[]) {
      pages.set(page.page, hanOnly(page.lines.map((line) => line.text).join(" ")));
    }
    documents.set(meta.document_id, pages);
  }
  return documents;
}

function sourcePagesOf(entry: CatalogEntry, ocr: Map<string, Map<number, string>>): string[] {
  return entry.source_refs.flatMap((ref) => {
    const pages = ocr.get(ref.document_id);
    if (!pages) throw new Error(`${entry.id}: no local OCR for ${ref.document_id}; the overlap check needs it.`);
    return ref.pdf_pages.map((page) => {
      const text = pages.get(page);
      if (text === undefined) throw new Error(`${entry.id}: page ${page} is outside ${ref.document_id}.`);
      return text;
    });
  });
}

const yuan = (fen: number) => `¥${(fen / 100).toFixed(2)}`;

type Context = {
  readonly entries: readonly CatalogEntry[];
  readonly ocr: Map<string, Map<number, string>>;
  readonly vocabulary: readonly string[];
  readonly acceptedPath: string;
  readonly rejectedPath: string;
};

type Candidate = { readonly entry: CatalogEntry; readonly answer: VoiceAnswer | undefined };

function problemsOf(context: Context, { entry, answer }: Candidate): readonly string[] {
  if (!answer) return ["no_answer"];
  return checkVoiceRewrite({
    original: entry.summary,
    rewrite: answer.summary,
    reportedPlaces: answer.places,
    sourcePages: sourcePagesOf(entry, context.ocr),
    vocabulary: context.vocabulary,
  });
}

/** Checks each candidate and appends it to the accepted or the rejected file. */
async function recordCandidates(context: Context, candidates: readonly Candidate[], source: string): Promise<{ accepted: number; rejected: number }> {
  const acceptedLines: string[] = [];
  const rejectedLines: string[] = [];
  for (const candidate of candidates) {
    const { entry, answer } = candidate;
    const problems = problemsOf(context, candidate);
    if (problems.length === 0 && answer) {
      acceptedLines.push(JSON.stringify({
        id: entry.id,
        field: "summary",
        value: answer.summary,
        based_on: summaryFingerprint(entry.summary),
        source,
        date: today,
      }));
    } else {
      rejectedLines.push(JSON.stringify({ id: entry.id, original: entry.summary, candidate: answer?.summary ?? null, problems, source, date: today }));
    }
  }
  await mkdir(dirname(context.acceptedPath), { recursive: true });
  if (acceptedLines.length > 0) await appendFile(context.acceptedPath, `${acceptedLines.join("\n")}\n`);
  if (rejectedLines.length > 0) await appendFile(context.rejectedPath, `${rejectedLines.join("\n")}\n`);
  return { accepted: acceptedLines.length, rejected: rejectedLines.length };
}

/** Rewrites written elsewhere (by hand or by another model): one {"id","summary"} line each. */
async function readCandidateFile(path: string, pending: readonly CatalogEntry[]): Promise<Candidate[]> {
  const byId = new Map(pending.map((entry) => [entry.id, entry]));
  const candidates: Candidate[] = [];
  for (const line of await readLines(path)) {
    const { id, summary, places } = line as { id?: unknown; summary?: unknown; places?: unknown };
    const entry = typeof id === "string" ? byId.get(id) : undefined;
    if (!entry || typeof summary !== "string") throw new Error(`${path}: ${JSON.stringify(line)} is not {"id","summary"} for a pending entry.`);
    byId.delete(entry.id);
    const reported = Array.isArray(places) ? places.filter((place): place is string => typeof place === "string") : [];
    candidates.push({ entry, answer: { summary: summary.trim(), places: reported } });
  }
  return candidates;
}

async function rewriteWithKimi(context: Context, pending: readonly CatalogEntry[], maxFen: number, maxBatches: number): Promise<void> {
  if (!paidCallsEnabled()) throw new Error("PAID_CALLS_ENABLED is false; no Kimi call was made.");
  const model = requireEnv("LLM_MODEL");
  const client = new OpenAI({
    apiKey: requireEnv("MOONSHOT_API_KEY"),
    baseURL: process.env.MOONSHOT_BASE_URL?.trim() || DEFAULT_MOONSHOT_BASE_URL,
    maxRetries: 0,
    timeout: requestTimeoutMs,
  });
  const batches = voiceBatches(pending, batchSize);

  let spentFen = 0;
  let dearestCallFen = 0;
  let accepted = 0;
  let rejected = 0;
  for (const [index, batch] of batches.entries()) {
    if (index >= maxBatches) break;
    // Stop before a call that could pass the cap: allow for one call half again as dear as the dearest so far.
    if (spentFen + dearestCallFen * 1.5 > maxFen) {
      process.stdout.write(`stopping: ${yuan(spentFen)} spent, the next call could pass ${yuan(maxFen)}\n`);
      break;
    }

    const startedAt = performance.now();
    const completion = await client.chat.completions.create(moonshotRequestBody({
      model,
      messages: [{ role: "system", content: voiceSystemPrompt }, { role: "user", content: voiceUserMessage(batch) }],
      response_format: { type: "json_schema", json_schema: { name: "catalog_summaries", strict: true, schema: voiceResponseJsonSchema } },
    }, model, reasoningEffortFromEnvironment()) as unknown as OpenAI.ChatCompletionCreateParamsNonStreaming);
    const usage = usageOf(completion);
    const callFen = usage ? kimiCostFen(model, usage) : 0;
    spentFen += callFen;
    dearestCallFen = Math.max(dearestCallFen, callFen);

    const answers = parseVoiceAnswers(completion.choices[0]?.message.content ?? null, batch);
    const counts = await recordCandidates(context, batch.map(({ n, entry }) => ({ entry, answer: answers.get(n) })), `Meri voice rewrite · ${completion.model}`);
    accepted += counts.accepted;
    rejected += counts.rejected;

    const seconds = Math.round((performance.now() - startedAt) / 1000);
    const tokens = usage ? `${usage.inputTokens} in (${usage.cachedTokens} cached) / ${usage.outputTokens} out` : "no usage reported";
    process.stdout.write(`call ${index + 1}/${batches.length}: ${counts.accepted} kept, ${counts.rejected} rejected, ${seconds}s, ${tokens}, ${yuan(callFen)} (total ${yuan(spentFen)})\n`);
  }
  process.stdout.write(`done: ${accepted} kept, ${rejected} rejected, ${yuan(spentFen)} spent\n`);
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: {
    "dry-run": { type: "boolean", default: false },
    batches: { type: "string" },
    "max-yuan": { type: "string", default: "10" },
    export: { type: "string" },
    check: { type: "string" },
    apply: { type: "string" },
    source: { type: "string" },
  } });
  const maxFen = Number(values["max-yuan"]) * 100;
  const maxBatches = values.batches === undefined ? Infinity : Number(values.batches);
  if (!(maxFen > 0) || !(maxBatches > 0)) throw new Error("--max-yuan and --batches must be positive numbers.");

  const catalogDir = requireEnv("CATALOG_DIR");
  const enrichmentDir = join(catalogDir, "data", "enrichment");
  const acceptedPath = join(enrichmentDir, "summaries.ndjson");
  const rejectedPath = join(enrichmentDir, "summaries-rejected.ndjson");

  const entries = await readEntries(catalogDir);
  const done = new Set([...await readLines(acceptedPath), ...await readLines(rejectedPath)].map((line) => (line as { id: string }).id));
  const pending = entries.filter((entry) => needsVoiceRewrite(entry) && !done.has(entry.id));
  process.stdout.write(`${entries.length} entries, ${pending.length} summaries to rewrite (${done.size} done before)\n`);
  if (values["dry-run"] || pending.length === 0) return;

  if (values.export) {
    const lines = pending.map((entry) => JSON.stringify({ id: entry.id, kind: entry.kind, name: entry.name, city: entry.location.prefecture, summary: entry.summary }));
    await writeFile(values.export, `${lines.join("\n")}\n`);
    process.stdout.write(`wrote ${lines.length} summaries to ${values.export}\n`);
    return;
  }

  const context: Context = { entries, ocr: await readOcr(catalogDir), vocabulary: placeNameVocabulary(entries), acceptedPath, rejectedPath };

  if (values.check) {
    // A dry check of drafted rewrites: prints the problems and writes nothing.
    const candidates = await readCandidateFile(values.check, pending);
    const failing = candidates.map((candidate) => [candidate.entry.id, problemsOf(context, candidate)] as const).filter(([, problems]) => problems.length > 0);
    for (const [id, problems] of failing) process.stdout.write(`${id}: ${problems.join("; ")}\n`);
    process.stdout.write(`${candidates.length - failing.length}/${candidates.length} pass\n`);
    return;
  }

  if (values.apply) {
    if (!values.source) throw new Error("--apply needs --source, the name recorded with each rewrite.");
    const counts = await recordCandidates(context, await readCandidateFile(values.apply, pending), values.source);
    process.stdout.write(`done: ${counts.accepted} kept, ${counts.rejected} rejected\n`);
    return;
  }

  await rewriteWithKimi(context, pending, maxFen, maxBatches);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
