import { logger, logEvents } from "@/platform/observability/logger";

/**
 * Amap limits how many requests one key may start per second, and over the limit it
 * still answers HTTP 200 — with `status: "0"` and a QPS infocode in the body. Measured
 * 2026-10-03 on this project's key: twelve parallel searches lost five to 10021; one
 * every 0.34 s never failed, one every 0.25 s or faster sometimes did. Limiting how
 * many run at once did not help — each answers in about 100 ms — so every Amap call
 * in the app takes a turn from one shared pacer that spaces their starts, and a
 * refused call waits and tries once more.
 */
const minStartIntervalMs = 350;
const retryDelayMs = 1_000;
const rateLimitInfocodes = new Set(["10004", "10014", "10019", "10020", "10021"]);

export interface Gate {
  run<T>(task: () => Promise<T>): Promise<T>;
}

/** Starts tasks no closer together than `intervalMs`, in the order they asked. */
export function createPacer(
  intervalMs: number,
  clock: { readonly now: () => number; readonly sleep: (ms: number) => Promise<void> } = {
    now: Date.now, sleep: (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)) },
): Gate {
  let nextStart = 0;
  return {
    async run(task) {
      const now = clock.now();
      const start = Math.max(now, nextStart);
      nextStart = start + intervalMs;
      if (start > now) await clock.sleep(start - now);
      return task();
    },
  };
}

/** One pacer per server process, shared by every Amap adapter. */
const sharedGate = createPacer(minStartIntervalMs);

export function isAmapRateLimited(body: unknown): boolean {
  if (typeof body !== "object" || body === null) return false;
  const { infocode, info } = body as Record<string, unknown>;
  return (typeof infocode === "string" && rateLimitInfocodes.has(infocode)) ||
    (typeof info === "string" && /QPS_HAS_EXCEEDED|ACCESS_TOO_FREQUENT/u.test(info));
}

async function rateLimited(response: Response): Promise<boolean> {
  if (!response.ok) return false;
  try {
    return isAmapRateLimited(await response.clone().json());
  } catch {
    return false;
  }
}

/**
 * Wraps a fetch so that it waits its turn at the gate and retries once when Amap
 * refuses it for going too fast. The caller reads the response exactly as before;
 * a second refusal comes back to it as the ordinary `status: "0"` it already handles.
 */
export function withAmapLimits(
  fetcher: typeof fetch,
  options: { readonly gate?: Gate; readonly sleep?: (ms: number) => Promise<void> } = {},
): typeof fetch {
  const gate = options.gate ?? sharedGate;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  return async (input, init) => {
    const first = await gate.run(() => fetcher(input, init));
    if (!(await rateLimited(first))) return first;
    logger.warn({ event: logEvents.amapRateLimited, retrying: true }, "Amap refused a request for exceeding its rate limit");
    await sleep(retryDelayMs);
    return gate.run(() => fetcher(input, init));
  };
}
