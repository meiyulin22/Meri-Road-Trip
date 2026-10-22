import { createPacer, type Gate } from "@/platform/amap/amap-fetch";
import { logger, logEvents } from "@/platform/observability/logger";

const apiBase = "https://api.tianditu.gov.cn";
/**
 * Measured 2026-10-22 on this project's key: twenty searches back to back lost eleven
 * to empty answers, while one every 0.3 s never failed. The pacer is the same
 * generic one the Amap adapters use, with a queue of its own.
 */
const minStartIntervalMs = 300;

/** One queue per server process, shared by every Tianditu adapter. */
const sharedGate = createPacer(minStartIntervalMs);

export type TiandituFailure = "missing_configuration" | "http_error" | "refused" | "malformed_response" | "timeout" | "network_error";

export type TiandituAnswer =
  | { readonly ok: true; readonly body: Record<string, unknown> }
  | { readonly ok: false; readonly reason: TiandituFailure };

export interface TiandituClient {
  /** Never throws; a failure says why in a fixed reason that holds no URL or key. */
  get(path: "/v2/search" | "/geocoder", params: Readonly<Record<string, string>>): Promise<TiandituAnswer>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

/**
 * Tianditu's firewall answers a request it does not trust — too fast — with HTTP 418,
 * or with HTTP 200 and an HTML page titled 访问被拦截 instead of JSON. Both are a
 * refusal, not "no such place".
 */
function isRefusal(status: number, text: string): boolean {
  return status === 418 || /^\s*</u.test(text);
}

export function createTiandituClient(
  fetcher: typeof fetch = fetch,
  options: { readonly timeoutMs?: number; readonly gate?: Gate } = {},
): TiandituClient {
  const gate = options.gate ?? sharedGate;
  const timeoutMs = options.timeoutMs ?? 8_000;
  return {
    async get(path, params) {
      const key = process.env.TIANDITU_API_KEY?.trim();
      if (!key) return { ok: false, reason: "missing_configuration" };
      const url = `${apiBase}${path}?${new URLSearchParams({ ...params, tk: key })}`;
      try {
        // The timeout starts when the request leaves the queue, as with Amap.
        const response = await gate.run(() => fetcher(url, {
          // Tianditu's firewall refuses requests without a browser-like User-Agent.
          headers: { "User-Agent": "Mozilla/5.0 (compatible; Meri)" },
          cache: "no-store",
          signal: AbortSignal.timeout(timeoutMs),
        }));
        const text = await response.text();
        if (isRefusal(response.status, text)) {
          logger.warn({ event: logEvents.tiandituRefused, path, statusCode: response.status }, "Tianditu refused a request");
          return { ok: false, reason: "refused" };
        }
        if (!response.ok) return { ok: false, reason: "http_error" };
        const body: unknown = JSON.parse(text);
        return isRecord(body) ? { ok: true, body } : { ok: false, reason: "malformed_response" };
      } catch (error) {
        // Fetch errors can include the request URL, which carries the key; keep only a reason.
        if (error instanceof SyntaxError) return { ok: false, reason: "malformed_response" };
        return { ok: false, reason: isTimeout(error) ? "timeout" : "network_error" };
      }
    },
  };
}
