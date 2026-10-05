import { createOpenAICompatible, type OpenAICompatibleProviderSettings } from "@ai-sdk/openai-compatible";

import { MissingLlmConfigurationError } from "@/platform/llm/kimi-client";

export const DEFAULT_MOONSHOT_MODEL = "kimi-k2.6";
export const DEFAULT_MOONSHOT_BASE_URL = "https://api.moonshot.cn/v1";

export type MoonshotChatModelOptions = {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly model: string;
  readonly fetch?: NonNullable<OpenAICompatibleProviderSettings["fetch"]>;
};

/**
 * The one way Meri builds a Kimi model, for the structured-output client and for the
 * agents alike. Thinking stays off: Kimi then answers in plain chat completions, and
 * a multi-step tool loop does not have to send its reasoning back on every turn.
 */
export function createMoonshotChatModel(options: MoonshotChatModelOptions) {
  const provider = createOpenAICompatible({
    name: "moonshot",
    apiKey: options.apiKey,
    baseURL: options.baseUrl,
    supportsStructuredOutputs: true,
    ...(options.fetch ? { fetch: options.fetch } : {}),
    transformRequestBody: (body) => ({
      ...body,
      thinking: { type: "disabled" },
    }),
  });
  return provider.chatModel(options.model);
}

/** The model the environment configures: MOONSHOT_API_KEY, optional MOONSHOT_BASE_URL and LLM_MODEL. */
export function createMoonshotChatModelFromEnvironment() {
  const apiKey = process.env.MOONSHOT_API_KEY?.trim();
  if (!apiKey) throw new MissingLlmConfigurationError();
  return createMoonshotChatModel({
    apiKey,
    baseUrl: process.env.MOONSHOT_BASE_URL?.trim() || DEFAULT_MOONSHOT_BASE_URL,
    model: process.env.LLM_MODEL?.trim() || DEFAULT_MOONSHOT_MODEL,
  });
}
