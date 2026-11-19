import { logger } from "@/platform/observability/logger";
import { providerLimits } from "@/platform/provider-limits";

import { clientAddress } from "./client-address";
import { createRateLimiter } from "./rate-limiter";

const hour = 60 * 60 * 1_000;

/**
 * Limits on one visitor and one address (step 3), counted in this server's memory: a restart clears
 * them, which is fine against a script, and no address is ever written to the database. The site's
 * own daily caps (step 2) still hold behind them.
 */
export type VisitorLimiters = {
  /** Requests to any endpoint that calls Kimi, per address an hour: KIMI_REQUESTS_PER_IP_PER_HOUR. */
  readonly kimiPerAddress: ReturnType<typeof createRateLimiter>;
  /** Workspace messages per visitor an hour: CHAT_TURNS_PER_GUEST_PER_HOUR. */
  readonly chatPerGuest: ReturnType<typeof createRateLimiter>;
};

export function createVisitorLimiters(limits = providerLimits, now?: () => number): VisitorLimiters {
  return {
    kimiPerAddress: createRateLimiter({ limit: limits.kimiRequestsPerIpPerHour, windowMs: hour, ...(now ? { now } : {}) }),
    chatPerGuest: createRateLimiter({ limit: limits.chatTurnsPerGuestPerHour, windowMs: hour, ...(now ? { now } : {}) }),
  };
}

// Kept across hot reloads in development, so a reload does not hand out fresh limits.
const globals = globalThis as typeof globalThis & { meriVisitorLimiters?: VisitorLimiters };
export const visitorLimiters = (globals.meriVisitorLimiters ??= createVisitorLimiters());

/** The answer when a visitor or address is over its limit: the page explains it in its own words. */
export function tooManyRequests(): Response {
  return Response.json(
    { error: "Too many requests; please slow down and try again later.", code: "too_many_requests" },
    { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": "600" } },
  );
}

/**
 * Whether a request to an endpoint that calls Kimi may go ahead (step 3): the address's hourly count,
 * and for a Workspace message the visitor's too. A refusal is the answer to send back; null lets it through.
 */
export function kimiRequestRefusal(
  request: Request,
  options: { readonly chatGuest?: string | null; readonly limiters?: VisitorLimiters } = {},
): Response | null {
  const limiters = options.limiters ?? visitorLimiters;
  const address = clientAddress(request);
  if (!limiters.kimiPerAddress.allow(address)) {
    logger.info({ limit: "kimi_per_address" }, "Request refused: this address made too many Kimi requests this hour");
    return tooManyRequests();
  }
  if (options.chatGuest !== undefined && !limiters.chatPerGuest.allow(options.chatGuest ?? `address:${address}`)) {
    logger.info({ limit: "chat_per_guest" }, "Message refused: this visitor sent too many messages this hour");
    return tooManyRequests();
  }
  return null;
}
