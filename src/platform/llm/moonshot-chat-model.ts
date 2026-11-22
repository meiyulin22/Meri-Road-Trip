import { createOpenAICompatible, type OpenAICompatibleProviderSettings } from "@ai-sdk/openai-compatible";

import { MissingLlmConfigurationError } from "@/platform/llm/kimi-client";
import { kimiFetch } from "@/platform/llm/kimi-spend";

export const DEFAULT_MOONSHOT_MODEL = "kimi-k2.6";
export const DEFAULT_MOONSHOT_BASE_URL = "https://api.moonshot.cn/v1";

export type MoonshotChatModelOptions = {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly model: string;
  readonly fetch?: NonNullable<OpenAICompatibleProviderSettings["fetch"]>;
  /** For K3 only; LLM_REASONING_EFFORT or "low" when not given. */
  readonly reasoningEffort?: ReasoningEffort;
};

/** Kimi K3 models always reason and take no `thinking` field (Kimi's K3 guides, read 2026-11-22). */
export function isAlwaysReasoningModel(model: string): boolean {
  return /^kimi-k3(?:[.-]|$)/u.test(model);
}

export const reasoningEfforts = ["low", "high", "max"] as const;
export type ReasoningEffort = (typeof reasoningEfforts)[number];

/** LLM_REASONING_EFFORT for K3, "low" unless set: Meri's steps are short, and reasoning is billed as output. */
export function reasoningEffortFromEnvironment(env: NodeJS.ProcessEnv = process.env): ReasoningEffort {
  const chosen = env.LLM_REASONING_EFFORT?.trim();
  return reasoningEfforts.find((effort) => effort === chosen) ?? "low";
}

/**
 * K3's reasoning counts toward max_tokens, and Kimi advises at least 16000 so the answer still fits.
 * Meri's caps are sized for the answer alone (300–6000 tokens), so on K3 they are raised to this.
 */
export const reasoningModelMinOutputTokens = 16_000;

/**
 * The request body as the model wants it. K2: thinking off, so Kimi answers in plain chat completions.
 * K3 (2026-11-22): no `thinking` (unsupported), a `reasoning_effort` instead, no `temperature` (fixed
 * at 1.0), and room for its reasoning under max_tokens. Its reasoning comes back as `reasoning_content`,
 * which the AI SDK keeps on the assistant message and sends back in a tool loop, as K3 requires.
 */
export function moonshotRequestBody(body: Record<string, unknown>, model: string, effort: ReasoningEffort): Record<string, unknown> {
  if (!isAlwaysReasoningModel(model)) return { ...body, thinking: { type: "disabled" } };
  const rest: Record<string, unknown> = { ...body };
  delete rest.thinking;
  delete rest.temperature;
  const cap = typeof rest.max_tokens === "number" ? Math.max(rest.max_tokens, reasoningModelMinOutputTokens) : undefined;
  return { ...rest, reasoning_effort: effort, ...(cap === undefined ? {} : { max_tokens: cap }) };
}

/**
 * K3 writes long JSON more slowly than K2 (2026-11-22 eval: 丽江 and 大理 research and every city's food hit
 * their K2-sized deadlines), so on K3 each step's deadline, the run's limit and the chat timeout are
 * stretched by this much. 2.5 left food at 133 s of 150 in the re-run, so 3.5 (merlin: room to spare). K2 keeps its deadlines.
 */
export const reasoningModelDeadlineFactor = 3.5;

/** A deadline in ms for the configured model: as written for K2, stretched for K3. */
export function modelDeadlineMs(ms: number, model: string = process.env.LLM_MODEL?.trim() || DEFAULT_MOONSHOT_MODEL): number {
  return isAlwaysReasoningModel(model) ? Math.round(ms * reasoningModelDeadlineFactor) : ms;
}

/**
 * The one way Meri builds a Kimi model, for the structured-output client and for the
 * agents alike, with the request body each Kimi model needs (`moonshotRequestBody`).
 */
export function createMoonshotChatModel(options: MoonshotChatModelOptions) {
  const effort = options.reasoningEffort ?? reasoningEffortFromEnvironment();
  const provider = createOpenAICompatible({
    name: "moonshot",
    apiKey: options.apiKey,
    baseURL: options.baseUrl,
    supportsStructuredOutputs: true,
    ...(options.fetch ? { fetch: options.fetch } : {}),
    transformRequestBody: (body) => moonshotRequestBody(body, options.model, effort),
  });
  return provider.chatModel(options.model);
}

/**
 * The model the environment configures: MOONSHOT_API_KEY, optional MOONSHOT_BASE_URL and LLM_MODEL.
 * Every call goes through the day's Kimi money and PAID_CALLS_ENABLED (step 2).
 */
export function createMoonshotChatModelFromEnvironment(options: { readonly reasoningEffort?: ReasoningEffort } = {}) {
  const apiKey = process.env.MOONSHOT_API_KEY?.trim();
  if (!apiKey) throw new MissingLlmConfigurationError();
  return createMoonshotChatModel({
    apiKey,
    baseUrl: process.env.MOONSHOT_BASE_URL?.trim() || DEFAULT_MOONSHOT_BASE_URL,
    model: process.env.LLM_MODEL?.trim() || DEFAULT_MOONSHOT_MODEL,
    fetch: kimiFetch,
    ...(options.reasoningEffort ? { reasoningEffort: options.reasoningEffort } : {}),
  });
}

/**
 * The steps that weigh things up and decide, routing the trip and choosing each day's stops, reason
 * harder on K3 (merlin, 2026-11-22): their answers are short, so more thought costs little, and they are
 * where it can help. Reading and copying steps keep LLM_REASONING_EFFORT. K2 does not reason either way.
 */
export const decidingReasoningEffort: ReasoningEffort = "high";

export function createDecidingModelFromEnvironment() {
  return createMoonshotChatModelFromEnvironment({ reasoningEffort: decidingReasoningEffort });
}
