import OpenAI from "openai";
import type { ChatCompletionCreateParamsNonStreaming } from "openai/resources/chat/completions";
import type { ToolSet } from "ai";

import { logger, logEvents } from "@/server/observability/logger";
import { serializeError } from "@/server/observability/serialize-error";

const DEFAULT_MODEL = "kimi-k2.6";
const DEFAULT_BASE_URL = "https://api.moonshot.cn/v1";
const REQUEST_TIMEOUT_MS = 60_000;

export interface StructuredOutputModelRequest {
  readonly requestId: string;
  readonly operation: string;
  readonly schemaName: string;
  readonly systemPrompt: string;
  readonly userMessage: string;
  readonly conversationHistory?: readonly StructuredOutputConversationMessage[];
  readonly jsonSchema: Record<string, unknown>;
  readonly tools?: ToolSet;
}

export interface StructuredOutputConversationMessage {
  readonly role: "user" | "assistant";
  readonly content: string;
}

export interface StructuredOutputModelResponse {
  readonly content: string | null;
  readonly model: string;
  readonly finishReason: string | null;
  readonly usage?: {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly reasoningTokens?: number;
    readonly totalTokens: number;
  };
}

export interface StructuredOutputModelClient {
  generateStructuredOutput(
    request: StructuredOutputModelRequest,
  ): Promise<StructuredOutputModelResponse>;
}

export class MissingLlmConfigurationError extends Error {
  constructor() {
    super("MOONSHOT_API_KEY is not configured.");
    this.name = "MissingLlmConfigurationError";
  }
}

export class LlmProviderRequestError extends Error {
  constructor(cause: unknown) {
    super("The LLM provider request failed.", { cause });
    this.name = "LlmProviderRequestError";
  }
}

export class LlmProviderTimeoutError extends Error {
  constructor(cause: unknown) {
    super("The LLM provider request timed out.", { cause });
    this.name = "LlmProviderTimeoutError";
  }
}

type KimiClientOptions = {
  apiKey: string;
  baseUrl: string;
  model: string;
  debugRawOutput: boolean;
};

type KimiChatCompletionRequest = ChatCompletionCreateParamsNonStreaming & {
  thinking: { type: "disabled" };
};

class KimiClient implements StructuredOutputModelClient {
  private readonly client: OpenAI;

  constructor(private readonly options: KimiClientOptions) {
    this.client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseUrl,
      maxRetries: 0,
      timeout: REQUEST_TIMEOUT_MS,
    });
  }

  async generateStructuredOutput(
    request: StructuredOutputModelRequest,
  ): Promise<StructuredOutputModelResponse> {
    const startedAt = performance.now();
    const context = {
      requestId: request.requestId,
      operation: request.operation,
      provider: "moonshot",
      model: this.options.model,
    } as const;

    logger.info(
      { event: logEvents.llmRequestStarted, ...context },
      "LLM request started",
    );

    try {
      const completionRequest: KimiChatCompletionRequest = {
        model: this.options.model,
        messages: [
          { role: "system", content: request.systemPrompt },
          ...(request.conversationHistory ?? []),
          { role: "user", content: request.userMessage },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: request.schemaName,
            strict: true,
            schema: request.jsonSchema,
          },
        },
        thinking: { type: "disabled" },
      };
      const completion =
        await this.client.chat.completions.create(completionRequest);

      const choice = completion.choices[0];
      const reasoningTokens =
        completion.usage?.completion_tokens_details?.reasoning_tokens;
      const usage = completion.usage
        ? {
            inputTokens: completion.usage.prompt_tokens,
            outputTokens: completion.usage.completion_tokens,
            ...(reasoningTokens !== undefined ? { reasoningTokens } : {}),
            totalTokens: completion.usage.total_tokens,
          }
        : undefined;
      const response = {
        content: choice?.message.content ?? null,
        model: completion.model,
        finishReason: choice?.finish_reason ?? null,
        ...(usage ? { usage } : {}),
      };
      const completedContext = {
        ...context,
        model: completion.model,
        durationMs: Math.round(performance.now() - startedAt),
        finishReason: response.finishReason,
        ...(usage ? { usage } : {}),
      };

      logger.info(
        { event: logEvents.llmRequestCompleted, ...completedContext },
        "LLM request completed",
      );

      if (this.options.debugRawOutput) {
        logger.debug(
          {
            event: logEvents.llmRawOutput,
            ...completedContext,
            rawOutput: response.content,
          },
          "LLM raw output",
        );
      }

      return response;
    } catch (error) {
      logger.error(
        {
          event: logEvents.llmRequestFailed,
          ...context,
          durationMs: Math.round(performance.now() - startedAt),
          error: serializeError(error),
        },
        "LLM request failed",
      );

      if (error instanceof OpenAI.APIConnectionTimeoutError) {
        throw new LlmProviderTimeoutError(error);
      }

      throw new LlmProviderRequestError(error);
    }
  }
}

export function createKimiClientFromEnvironment(): StructuredOutputModelClient {
  const apiKey = process.env.MOONSHOT_API_KEY?.trim();

  if (!apiKey) {
    throw new MissingLlmConfigurationError();
  }

  return new KimiClient({
    apiKey,
    baseUrl: process.env.MOONSHOT_BASE_URL?.trim() || DEFAULT_BASE_URL,
    model: process.env.LLM_MODEL?.trim() || DEFAULT_MODEL,
    debugRawOutput:
      process.env.NODE_ENV === "development" &&
      process.env.LLM_DEBUG_OUTPUT === "true",
  });
}
