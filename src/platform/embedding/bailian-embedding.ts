import { join } from "node:path";

import { z } from "zod";

import { createDailyBudget, type DailyBudget } from "@/platform/http/daily-budget";
import type { Gate } from "@/platform/http/request-pacer";
import { paidCallsEnabled, providerLimits } from "@/platform/provider-limits";

/** 百炼 accepts up to 20 texts a request for qwen3.7-text-embedding (10 for text-embedding-v4). */
export const maxTextsPerRequest = 20;

/** Turns texts into vectors of one fixed size, in the order given. */
export type EmbeddingClient = {
  readonly model: string;
  readonly dimensions: number;
  readonly embed: (texts: readonly string[], signal?: AbortSignal) => Promise<number[][]>;
};

export type EmbeddingErrorCode = "daily_limit" | "paid_calls_paused" | "too_many_texts" | "http_error" | "invalid_response";

export class EmbeddingError extends Error {
  readonly code: EmbeddingErrorCode;
  readonly status: number | null;

  constructor(code: EmbeddingErrorCode, message: string, options: { status?: number; cause?: unknown } = {}) {
    super(message, { cause: options.cause });
    this.name = "EmbeddingError";
    this.code = code;
    this.status = options.status ?? null;
  }
}

const responseSchema = z.object({
  data: z.array(z.object({ index: z.number().int().nonnegative(), embedding: z.array(z.number()) })),
  usage: z.object({ total_tokens: z.number().int().nonnegative() }).optional(),
});

/** Embedding requests a Beijing day: EMBEDDING_MAX_CALLS_PER_DAY, default 500 (RAG step 3). */
const sideBySide: Gate = { run: (task) => task(), pause: () => {} };
export const sharedEmbeddingBudget = createDailyBudget({ intervalMs: 0, dailyUnits: providerLimits.embeddingCallsPerDay, pauseMs: 0 }, {
  file: join(process.cwd(), ".cache", "embedding-calls.json"),
  gate: sideBySide,
  label: { provider: "百炼 embedding", units: (count) => `${count} requests` },
});

/**
 * 百炼's OpenAI-compatible embeddings endpoint (the workspace's own base URL). One request, no retry:
 * a failure is the caller's, which falls back to ranking without vectors.
 */
export function createBailianEmbedding(options: {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly model: string;
  readonly dimensions: number;
  readonly budget?: DailyBudget;
  readonly fetch?: typeof fetch;
  readonly paidCallsEnabled?: () => boolean;
}): EmbeddingClient {
  const send = options.fetch ?? fetch;
  const paidOn = options.paidCallsEnabled ?? (() => paidCallsEnabled());
  const endpoint = `${options.baseUrl.replace(/\/+$/u, "")}/embeddings`;

  async function request(texts: readonly string[], signal?: AbortSignal): Promise<number[][]> {
    let response: Response;
    try {
      response = await send(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${options.apiKey}` },
        body: JSON.stringify({ model: options.model, input: texts, dimensions: options.dimensions, encoding_format: "float" }),
        signal,
      });
    } catch (error) {
      throw new EmbeddingError("http_error", `百炼 embedding request to ${options.model} failed to send.`, { cause: error });
    }
    if (!response.ok) {
      // The body may echo the request; only the status goes into the error.
      throw new EmbeddingError("http_error", `百炼 embedding answered HTTP ${response.status} for ${options.model}.`, { status: response.status });
    }
    const parsed = responseSchema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) {
      throw new EmbeddingError("invalid_response", `百炼 embedding returned an unexpected shape for ${options.model}.`, { cause: parsed.error });
    }
    // Filled, not `new Array(n)`: some() skips the holes of a sparse array, so a missing vector would pass.
    const vectors = Array.from<number[] | undefined>({ length: texts.length });
    for (const item of parsed.data.data) {
      if (item.index < texts.length && item.embedding.length === options.dimensions) vectors[item.index] = item.embedding;
    }
    if (vectors.some((vector) => vector === undefined)) {
      throw new EmbeddingError("invalid_response", `百炼 embedding did not return ${texts.length} vectors of ${options.dimensions} for ${options.model}.`);
    }
    return vectors as number[][];
  }

  return {
    model: options.model,
    dimensions: options.dimensions,
    async embed(texts, signal) {
      if (texts.length === 0) return [];
      if (texts.length > maxTextsPerRequest) {
        throw new EmbeddingError("too_many_texts", `At most ${maxTextsPerRequest} texts a request, got ${texts.length}.`);
      }
      if (!paidOn()) throw new EmbeddingError("paid_calls_paused", "PAID_CALLS_ENABLED=false: no embedding request sent.");
      if (!options.budget) return request(texts, signal);
      const asked = await options.budget.run(1, () => request(texts, signal));
      if (!asked.ok) throw new EmbeddingError("daily_limit", "The day's embedding requests are spent.");
      return asked.value;
    },
  };
}

/**
 * The client from DASHSCOPE_API_KEY, EMBEDDING_BASE_URL and EMBEDDING_MODEL, or null when the key or
 * the address is missing: without it, catalog ranking simply has no vector list.
 */
export function createEmbeddingFromEnvironment(dimensions: number, env: Readonly<Record<string, string | undefined>> = process.env): EmbeddingClient | null {
  const apiKey = env.DASHSCOPE_API_KEY?.trim();
  const baseUrl = env.EMBEDDING_BASE_URL?.trim();
  if (!apiKey || !baseUrl) return null;
  return createBailianEmbedding({
    apiKey,
    baseUrl,
    model: env.EMBEDDING_MODEL?.trim() || "qwen3.7-text-embedding",
    dimensions,
    budget: sharedEmbeddingBudget,
  });
}
