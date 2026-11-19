import { join } from "node:path";

import { createDailyBudget, type DailyMeter } from "@/platform/http/daily-budget";
import type { Gate } from "@/platform/http/request-pacer";
import { logger } from "@/platform/observability/logger";
import { paidCallsEnabled, providerLimits } from "@/platform/provider-limits";

/**
 * Kimi's prices in yuan per million tokens, from the console's table merlin pasted on 2026-11-19.
 * Input not served from the cache is charged at the input price, which is also the 5-minute cache
 * write price for K3. A model missing here is priced as the dearest, so the cap errs on the safe side.
 */
export const kimiPrices: Readonly<Record<string, { readonly input: number; readonly output: number; readonly cached: number }>> = {
  "kimi-k2.6": { input: 6.5, output: 27, cached: 1.1 },
  "kimi-k2.7-code": { input: 6.5, output: 27, cached: 1.3 },
  "kimi-k2.7-code-highspeed": { input: 13, output: 54, cached: 2.6 },
  "kimi-k3.1-pro": { input: 13, output: 68, cached: 1.3 },
  "kimi-k3.1-pro-highspeed": { input: 26, output: 136, cached: 1.3 },
  "kimi-k3": { input: 20, output: 100, cached: 2 },
};
const dearest = { input: 26, output: 136, cached: 2.6 };

export type KimiUsage = { readonly inputTokens: number; readonly outputTokens: number; readonly cachedTokens: number };

/** What one call cost, in fen: uncached input, cached input and output at the model's prices. */
export function kimiCostFen(model: string, usage: KimiUsage): number {
  const price = kimiPrices[model] ?? dearest;
  const cached = Math.min(usage.cachedTokens, usage.inputTokens);
  const yuan = ((usage.inputTokens - cached) * price.input + cached * price.cached + usage.outputTokens * price.output) / 1_000_000;
  return yuan * 100;
}

const count = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0);

/**
 * The usage of one OpenAI-style answer, JSON or a stream's last chunks. Kimi reports cache hits as
 * `cached_tokens`, or as `prompt_tokens_details.cached_tokens`; without either, all input is counted
 * at the full price.
 */
export function usageOf(body: unknown): KimiUsage | null {
  if (typeof body !== "object" || body === null) return null;
  const usage = (body as { usage?: unknown }).usage;
  if (typeof usage !== "object" || usage === null) return null;
  const fields = usage as { prompt_tokens?: unknown; completion_tokens?: unknown; cached_tokens?: unknown; prompt_tokens_details?: { cached_tokens?: unknown } | null };
  return {
    inputTokens: count(fields.prompt_tokens),
    outputTokens: count(fields.completion_tokens),
    cachedTokens: count(fields.cached_tokens) || count(fields.prompt_tokens_details?.cached_tokens),
  };
}

function usageOfText(text: string, streamed: boolean): KimiUsage | null {
  if (!streamed) {
    try {
      return usageOf(JSON.parse(text));
    } catch {
      return null;
    }
  }
  // A stream carries the usage on one of its last data lines.
  for (const line of text.split("\n").reverse()) {
    const data = line.startsWith("data:") ? line.slice(5).trim() : "";
    if (!data || data === "[DONE]") continue;
    try {
      const usage = usageOf(JSON.parse(data));
      if (usage) return usage;
    } catch {
      // Not a JSON chunk; keep looking.
    }
  }
  return null;
}

/** Why Meri refused to call Kimi: the switch is off, or today's money is spent. */
export type KimiRefusal = "paid_calls_paused" | "daily_quota";

// The marker in the refusal's body, so the error the AI SDK builds from it can be told apart.
const refusalMarker = "meri_refused:";

/** Whether an error, or one it wraps, is Meri refusing to call Kimi, and why. */
export function kimiRefusalOf(error: unknown): KimiRefusal | null {
  let current: unknown = error;
  for (let depth = 0; depth < 6 && current; depth += 1) {
    const fields = current as { responseBody?: unknown; message?: unknown; cause?: unknown };
    const text = `${typeof fields.responseBody === "string" ? fields.responseBody : ""} ${typeof fields.message === "string" ? fields.message : ""}`;
    if (text.includes(`${refusalMarker}paid_calls_paused`)) return "paid_calls_paused";
    if (text.includes(`${refusalMarker}daily_quota`)) return "daily_quota";
    current = fields.cause;
  }
  return null;
}

type Fetch = typeof fetch;

/**
 * Kimi's fetch with the day's money on it (step 2): before a call, the switch and the day's room are
 * checked, and a refusal answers 403 without reaching Kimi (a status the AI SDK does not retry);
 * after it, the answer's usage is priced and counted. Counting reads a copy of the answer, so the
 * caller gets the answer as it came.
 */
export function meteredKimiFetch(meter: DailyMeter, base: Fetch = fetch, enabled: () => boolean = paidCallsEnabled): Fetch {
  return async (input, init) => {
    const refusal: KimiRefusal | null = !enabled() ? "paid_calls_paused" : !meter.room() ? "daily_quota" : null;
    if (refusal) {
      return Response.json({ error: { type: "meri_refused", message: `${refusalMarker}${refusal}` } }, { status: 403 });
    }
    const response = await base(input, init);
    let model = "";
    try {
      model = String((JSON.parse(String(init?.body ?? "{}")) as { model?: unknown }).model ?? "");
    } catch {
      // A body that is not JSON is priced as the dearest model.
    }
    const streamed = (response.headers.get("content-type") ?? "").includes("event-stream");
    void response.clone().text().then((text) => {
      const usage = usageOfText(text, streamed);
      if (usage) meter.record(kimiCostFen(model, usage));
    }).catch((error: unknown) => {
      logger.warn({ error: error instanceof Error ? error.name : "unknown" }, "Kimi usage could not be read; this call was not counted");
    });
    return response;
  };
}

// Calls run side by side (research sends several at once); the meter counts, it does not queue.
const sideBySide: Gate = { run: (task) => task(), pause: () => {} };

/** Kimi model money a Beijing day: KIMI_MAX_YUAN_PER_DAY, default ¥40, counted in fen across restarts. */
export const sharedKimiSpend = createDailyBudget({ intervalMs: 0, dailyUnits: providerLimits.kimiFenPerDay, pauseMs: 0 }, {
  file: join(process.cwd(), ".cache", "kimi-spend.json"),
  gate: sideBySide,
  label: { provider: "Kimi", units: (fen) => `¥${(fen / 100).toFixed(2)}` },
});

/** Whether a Kimi call would be refused right now, for a run to say why it stopped. */
export function kimiRefusalNow(meter: DailyMeter = sharedKimiSpend, enabled: () => boolean = paidCallsEnabled): KimiRefusal | null {
  if (!enabled()) return "paid_calls_paused";
  return meter.room() ? null : "daily_quota";
}

/** The fetch every Kimi model built from the environment uses. */
export const kimiFetch: Fetch = meteredKimiFetch(sharedKimiSpend);
