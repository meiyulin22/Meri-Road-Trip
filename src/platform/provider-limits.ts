import { logger } from "@/platform/observability/logger";

/**
 * What Generate plan may spend on providers that cost money or goodwill (1.2113), in one place.
 * Each can be set in .env.local (see .env.example for what each does); unset or invalid, the default
 * agreed with merlin holds. Prices per call are provider facts and stay in their adapters.
 */
export type ProviderLimits = {
  /** VARIFLIGHT_MAX_YUAN_PER_PLAN: VariFlight money one Generate plan may spend, in fen. Default ¥2. */
  readonly variflightFenPerPlan: number;
  /** VARIFLIGHT_MAX_YUAN_PER_DAY: VariFlight money a Beijing day may spend, all plans together, in fen. Default ¥20. */
  readonly variflightFenPerDay: number;
  /** RAIL_MAX_SEARCHES_PER_PLAN: 12306 train searches one plan may make; each is two requests. Default 8. */
  readonly railSearchesPerPlan: number;
  /** RAIL_MAX_REQUESTS_PER_DAY: 12306 requests a Beijing day, all plans together. Default 100. */
  readonly railRequestsPerDay: number;
  /** BOCHA_MAX_CALLS_PER_DAY: Bocha web searches a Beijing day, plans and Workspace together. Default 500. */
  readonly bochaCallsPerDay: number;
  /** KIMI_MAX_SEARCHES_PER_DAY: Kimi web searches (search_pro) a Beijing day; 5–14 a plan measured, 30 plans. Default 450. */
  readonly kimiSearchesPerDay: number;
  /** KIMI_MAX_YUAN_PER_DAY: Kimi model money a Beijing day, chat and plans together, in fen. Default ¥40 (merlin, 2026-11-19). */
  readonly kimiFenPerDay: number;
  /** PLAN_RUNS_PER_DAY: Generate plan runs started a Beijing day, the whole site. Default 30. */
  readonly planRunsPerDay: number;
  /** PLAN_RUNS_PER_GUEST_PER_DAY: runs one visitor may start a Beijing day; runs that failed on Meri's side do not count. Default 3. */
  readonly planRunsPerGuestPerDay: number;
  /** PLAN_RUNS_PER_IP_PER_DAY: runs one address may start in 24 hours, kept high for shared office networks. Default 6. */
  readonly planRunsPerIpPerDay: number;
  /** CHAT_TURNS_PER_GUEST_PER_HOUR: Workspace messages one visitor may send an hour. Default 30. */
  readonly chatTurnsPerGuestPerHour: number;
  /** KIMI_REQUESTS_PER_IP_PER_HOUR: requests to any endpoint that calls Kimi, one address an hour. Default 120. */
  readonly kimiRequestsPerIpPerHour: number;
};

export const defaultProviderLimits: ProviderLimits = {
  variflightFenPerPlan: 200,
  variflightFenPerDay: 2_000,
  railSearchesPerPlan: 8,
  railRequestsPerDay: 100,
  bochaCallsPerDay: 500,
  kimiSearchesPerDay: 450,
  kimiFenPerDay: 4_000,
  planRunsPerDay: 30,
  planRunsPerGuestPerDay: 3,
  planRunsPerIpPerDay: 6,
  chatTurnsPerGuestPerHour: 30,
  kimiRequestsPerIpPerHour: 120,
};

type Environment = Readonly<Record<string, string | undefined>>;

/** A positive number from the environment, or the default with a warning when it is not one. */
function positive(env: Environment, name: string, fallback: number, scale: number, whole: boolean): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  const scaled = Math.round(value * scale);
  if (!Number.isFinite(value) || value <= 0 || (whole && !Number.isInteger(value)) || scaled <= 0) {
    logger.warn({ variable: name }, `${name} is not a positive ${whole ? "whole number" : "amount"}; using the default`);
    return fallback;
  }
  return scaled;
}

export function providerLimitsFrom(env: Environment): ProviderLimits {
  return {
    variflightFenPerPlan: positive(env, "VARIFLIGHT_MAX_YUAN_PER_PLAN", defaultProviderLimits.variflightFenPerPlan, 100, false),
    variflightFenPerDay: positive(env, "VARIFLIGHT_MAX_YUAN_PER_DAY", defaultProviderLimits.variflightFenPerDay, 100, false),
    railSearchesPerPlan: positive(env, "RAIL_MAX_SEARCHES_PER_PLAN", defaultProviderLimits.railSearchesPerPlan, 1, true),
    railRequestsPerDay: positive(env, "RAIL_MAX_REQUESTS_PER_DAY", defaultProviderLimits.railRequestsPerDay, 1, true),
    bochaCallsPerDay: positive(env, "BOCHA_MAX_CALLS_PER_DAY", defaultProviderLimits.bochaCallsPerDay, 1, true),
    kimiSearchesPerDay: positive(env, "KIMI_MAX_SEARCHES_PER_DAY", defaultProviderLimits.kimiSearchesPerDay, 1, true),
    kimiFenPerDay: positive(env, "KIMI_MAX_YUAN_PER_DAY", defaultProviderLimits.kimiFenPerDay, 100, false),
    planRunsPerDay: positive(env, "PLAN_RUNS_PER_DAY", defaultProviderLimits.planRunsPerDay, 1, true),
    planRunsPerGuestPerDay: positive(env, "PLAN_RUNS_PER_GUEST_PER_DAY", defaultProviderLimits.planRunsPerGuestPerDay, 1, true),
    planRunsPerIpPerDay: positive(env, "PLAN_RUNS_PER_IP_PER_DAY", defaultProviderLimits.planRunsPerIpPerDay, 1, true),
    chatTurnsPerGuestPerHour: positive(env, "CHAT_TURNS_PER_GUEST_PER_HOUR", defaultProviderLimits.chatTurnsPerGuestPerHour, 1, true),
    kimiRequestsPerIpPerHour: positive(env, "KIMI_REQUESTS_PER_IP_PER_HOUR", defaultProviderLimits.kimiRequestsPerIpPerHour, 1, true),
  };
}

/**
 * PAID_CALLS_ENABLED (step 2): false stops every call that costs money (Kimi, Kimi search, Bocha,
 * VariFlight) before it is sent; anything but "false" leaves them on. Read on every call, so the
 * running server follows it from the next restart and tests can set it.
 */
export function paidCallsEnabled(env: Environment = process.env): boolean {
  return env.PAID_CALLS_ENABLED?.trim().toLowerCase() !== "false";
}

/** Read once per server process; a change in .env.local takes effect on restart. */
export const providerLimits = providerLimitsFrom(process.env);
