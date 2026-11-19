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
};

export const defaultProviderLimits: ProviderLimits = {
  variflightFenPerPlan: 200,
  variflightFenPerDay: 2_000,
  railSearchesPerPlan: 8,
  railRequestsPerDay: 100,
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
  };
}

/** Read once per server process; a change in .env.local takes effect on restart. */
export const providerLimits = providerLimitsFrom(process.env);
