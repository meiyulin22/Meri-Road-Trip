import { logger, logEvents } from "@/platform/observability/logger";

/**
 * Amap limits how many requests one key may start per second, and over the limit it
 * still answers HTTP 200 — with `status: "0"` and a QPS infocode in the body. Measured
 * 2026-10-03 on this project's key: twelve parallel searches lost five to 10021; one
 * every 0.34 s never failed, one every 0.25 s or faster sometimes did. Limiting how
 * many run at once did not help — each answers in about 100 ms — so every Amap call
 * in the app waits its turn in one shared queue that spaces their starts. When Amap
 * still refuses one, the whole queue cools down before anyone else starts, and the
 * refused call goes first once it does.
 */
const minStartIntervalMs = 350;
const cooldownMs = 1_000;
const maxRetries = 3;
const rateLimitInfocodes = new Set(["10004", "10014", "10019", "10020", "10021"]);

export interface Gate {
  /** Waits for a turn, then runs the task. `first` takes the next turn instead of the last. */
  run<T>(task: () => Promise<T>, options?: { readonly first?: boolean }): Promise<T>;
  /** Holds every waiting and future task back for at least `ms` from now. */
  pause(ms: number): void;
}

export interface Clock {
  readonly now: () => number;
  readonly sleep: (ms: number) => Promise<void>;
}

const systemClock: Clock = {
  now: Date.now,
  sleep: (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
};

/**
 * Starts tasks no closer together than `intervalMs`, in the order they asked. Turns
 * are handed out one at a time rather than booked ahead, so a pause also holds back
 * the tasks that were already waiting.
 */
export function createPacer(intervalMs: number, clock: Clock = systemClock): Gate {
  const waiting: (() => void)[] = [];
  let nextStart = 0;
  let handingOut = false;

  async function handOutTurns(): Promise<void> {
    handingOut = true;
    while (waiting.length > 0) {
      const wait = nextStart - clock.now();
      if (wait > 0) {
        await clock.sleep(wait);
        // A pause may have moved nextStart while this slept, so look again.
        continue;
      }
      nextStart = clock.now() + intervalMs;
      waiting.shift()?.();
    }
    handingOut = false;
  }

  return {
    async run(task, options = {}) {
      await new Promise<void>((resolve) => {
        if (options.first) waiting.unshift(resolve);
        else waiting.push(resolve);
        if (!handingOut) void handOutTurns();
      });
      return task();
    },
    pause(ms) {
      nextStart = Math.max(nextStart, clock.now() + ms);
    },
  };
}

/** One queue per server process, shared by every Amap adapter. */
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
 * The timeout starts when the request is sent, not when it was asked for: with a dozen
 * photo lookups queued 350 ms apart, a timer started at the back of the queue ran out
 * before the request ever left, and the last card silently got no photo.
 */
function attemptSignal(timeoutMs: number, callerSignal: AbortSignal | null | undefined): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return callerSignal ? AbortSignal.any([callerSignal, timeout]) : timeout;
}

/**
 * Wraps a fetch so that each attempt waits its turn in the queue and gets `timeoutMs`
 * once it is sent. A refusal for going too fast pauses the whole queue, then the same
 * request retries at the front, up to `maxRetries` times. The caller reads the response
 * exactly as before; a last refusal comes back as the ordinary `status: "0"` it handles.
 */
export function withAmapLimits(
  fetcher: typeof fetch,
  options: { readonly timeoutMs: number; readonly gate?: Gate },
): typeof fetch {
  const gate = options.gate ?? sharedGate;
  return async (input, init) => {
    for (let attempt = 0; ; attempt += 1) {
      const response = await gate.run(
        () => fetcher(input, { ...init, signal: attemptSignal(options.timeoutMs, init?.signal) }),
        { first: attempt > 0 },
      );
      if (!(await rateLimited(response))) return response;
      const retrying = attempt < maxRetries;
      logger.warn({ event: logEvents.amapRateLimited, attempt: attempt + 1, retrying },
        "Amap refused a request for exceeding its rate limit");
      if (!retrying) return response;
      gate.pause(cooldownMs);
    }
  };
}
