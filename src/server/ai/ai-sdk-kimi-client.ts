import {
  createOpenAICompatible,
  type OpenAICompatibleProviderSettings,
} from "@ai-sdk/openai-compatible";
import { generateText, jsonSchema, NoObjectGeneratedError, Output, stepCountIs } from "ai";

import {
  LlmProviderRequestError,
  LlmProviderTimeoutError,
  MissingLlmConfigurationError,
  type StructuredOutputModelClient,
  type StructuredOutputModelRequest,
  type StructuredOutputModelResponse,
} from "@/server/ai/kimi-client";
import { logger, logEvents } from "@/server/observability/logger";
import { serializeError } from "@/server/observability/serialize-error";

const DEFAULT_MODEL = "kimi-k2.6";
const DEFAULT_BASE_URL = "https://api.moonshot.cn/v1";
const REQUEST_TIMEOUT_MS = 60_000;

type ProviderFetch = NonNullable<OpenAICompatibleProviderSettings["fetch"]>;

export type AiSdkKimiClientOptions = {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly model: string;
  readonly debugRawOutput: boolean;
  readonly requestTimeoutMs?: number;
  readonly fetch?: ProviderFetch;
};

type RawCompletion = {
  readonly model?: unknown;
  readonly choices?: ReadonlyArray<{
    readonly finish_reason?: unknown;
    readonly message?: { readonly content?: unknown };
  }>;
  readonly usage?: {
    readonly prompt_tokens?: unknown;
    readonly completion_tokens?: unknown;
    readonly completion_tokens_details?: {
      readonly reasoning_tokens?: unknown;
    } | null;
    readonly total_tokens?: unknown;
  } | null;
};

type AiSdkUsage = {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly outputTokenDetails?: {
    readonly reasoningTokens?: number;
  };
  readonly totalTokens?: number;
};

type AiSdkResponseMetadata = {
  readonly modelId?: string;
  readonly body?: unknown;
};

function asRawCompletion(value: unknown): RawCompletion | undefined {
  if (value === null || typeof value !== "object") {
    return undefined;
  }

  return value as RawCompletion;
}

function readContent(rawCompletion: RawCompletion | undefined): string | null | undefined {
  const content = rawCompletion?.choices?.[0]?.message?.content;
  return typeof content === "string" || content === null ? content : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function normalizeUsage(
  rawCompletion: RawCompletion | undefined,
  aiSdkUsage: AiSdkUsage | undefined,
): StructuredOutputModelResponse["usage"] {
  const rawUsage = rawCompletion?.usage;
  const inputTokens =
    typeof rawUsage?.prompt_tokens === "number"
      ? rawUsage.prompt_tokens
      : aiSdkUsage?.inputTokens;
  const outputTokens =
    typeof rawUsage?.completion_tokens === "number"
      ? rawUsage.completion_tokens
      : aiSdkUsage?.outputTokens;
  const totalTokens =
    typeof rawUsage?.total_tokens === "number"
      ? rawUsage.total_tokens
      : aiSdkUsage?.totalTokens;

  if (
    inputTokens === undefined ||
    outputTokens === undefined ||
    totalTokens === undefined
  ) {
    return undefined;
  }

  const rawReasoningTokens =
    rawUsage?.completion_tokens_details?.reasoning_tokens;
  const reasoningTokens =
    typeof rawReasoningTokens === "number"
      ? rawReasoningTokens
      : aiSdkUsage?.outputTokenDetails?.reasoningTokens;

  return {
    inputTokens,
    outputTokens,
    ...(reasoningTokens !== undefined ? { reasoningTokens } : {}),
    totalTokens,
  };
}

function normalizeFinishReason(
  rawCompletion: RawCompletion | undefined,
  aiSdkFinishReason: string | undefined,
): string | null {
  const rawFinishReason = rawCompletion?.choices?.[0]?.finish_reason;
  if (typeof rawFinishReason === "string") {
    return rawFinishReason;
  }

  switch (aiSdkFinishReason) {
    case "content-filter":
      return "content_filter";
    case "tool-calls":
      return "tool_calls";
    default:
      return aiSdkFinishReason ?? null;
  }
}

function createResponse({
  fallbackContent,
  fallbackFinishReason,
  fallbackModel,
  metadata,
  usage,
}: {
  fallbackContent: string | null;
  fallbackFinishReason?: string;
  fallbackModel: string;
  metadata: AiSdkResponseMetadata | undefined;
  usage: AiSdkUsage | undefined;
}): StructuredOutputModelResponse {
  const rawCompletion = asRawCompletion(metadata?.body);
  const rawContent = readContent(rawCompletion);
  const normalizedUsage = normalizeUsage(rawCompletion, usage);

  return {
    content: rawContent === undefined ? fallbackContent : rawContent,
    model:
      readString(rawCompletion?.model) ?? metadata?.modelId ?? fallbackModel,
    finishReason: normalizeFinishReason(rawCompletion, fallbackFinishReason),
    ...(normalizedUsage ? { usage: normalizedUsage } : {}),
  };
}

function isTimeoutError(error: unknown): boolean {
  const visited = new Set<unknown>();
  let current = error;

  while (current !== null && typeof current === "object" && !visited.has(current)) {
    visited.add(current);

    if ("name" in current && current.name === "TimeoutError") {
      return true;
    }

    if ("cause" in current && current.cause !== undefined) {
      current = current.cause;
      continue;
    }

    if ("lastError" in current && current.lastError !== undefined) {
      current = current.lastError;
      continue;
    }

    break;
  }

  return false;
}

export class AiSdkKimiClient implements StructuredOutputModelClient {
  constructor(private readonly options: AiSdkKimiClientOptions) {}

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
      const provider = createOpenAICompatible({
        name: "moonshot",
        apiKey: this.options.apiKey,
        baseURL: this.options.baseUrl,
        supportsStructuredOutputs: true,
        ...(this.options.fetch ? { fetch: this.options.fetch } : {}),
        transformRequestBody: (body) => ({
          ...body,
          thinking: { type: "disabled" },
        }),
      });
      const model = provider.chatModel(this.options.model);
      const messages = [
        ...(request.conversationHistory ?? []),
        ...(request.userMessage === undefined ? [] : [{ role: "user" as const, content: request.userMessage }]),
      ];
      // Moonshot favors the strict JSON response over optional tool calls when
      // both are requested in one generation. Let it choose a tool first, then
      // keep the existing strict schema for the final Workspace interpretation.
      const toolDecision = request.tools
        ? await generateText({
            model,
            system: `${request.systemPrompt}\n\nThis is a tool-selection step, not the final JSON reply. Call resolve_location only for the current TripState destination when the current user task needs geographic identification or disambiguation. Do not call it for an explicit destination update; the application resolves the new destination after persistence. The query must exactly match TripState.destination.value. An origin or destination in TripState alone is not a reason to call it. Do not call it for casual conversation, meta questions about Meri, or unrelated questions. Otherwise respond only NO_TOOL. Do not answer the user yet.`,
            messages,
            tools: request.tools,
            stopWhen: stepCountIs(1),
            maxRetries: 0,
            timeout: this.options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS,
          })
        : null;
      const result = await generateText({
        model,
        system: request.systemPrompt,
        ...(toolDecision?.toolCalls.length
          ? { messages: [...messages, ...toolDecision.response.messages] }
          : request.userMessage === undefined || request.conversationHistory?.length
            ? { messages }
            : { prompt: request.userMessage }),
        output: Output.object({
          name: request.schemaName,
          schema: jsonSchema(request.jsonSchema),
        }),
        maxRetries: 0,
        timeout: this.options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS,
      });
      const finalResponse = createResponse({
        fallbackContent: result.text === "" ? null : result.text,
        fallbackFinishReason: result.rawFinishReason ?? result.finishReason,
        fallbackModel: this.options.model,
        metadata: result.response,
        usage: result.usage,
      });
      const decisionUsage = toolDecision
        ? normalizeUsage(undefined, toolDecision.totalUsage)
        : undefined;
      const response = decisionUsage && finalResponse.usage
        ? {
            ...finalResponse,
            usage: {
              inputTokens: decisionUsage.inputTokens + finalResponse.usage.inputTokens,
              outputTokens: decisionUsage.outputTokens + finalResponse.usage.outputTokens,
              ...(decisionUsage.reasoningTokens !== undefined || finalResponse.usage.reasoningTokens !== undefined
                ? { reasoningTokens: (decisionUsage.reasoningTokens ?? 0) + (finalResponse.usage.reasoningTokens ?? 0) }
                : {}),
              totalTokens: decisionUsage.totalTokens + finalResponse.usage.totalTokens,
            },
          }
        : finalResponse;

      this.logCompletedResponse(context, startedAt, response);
      return response;
    } catch (error) {
      if (NoObjectGeneratedError.isInstance(error)) {
        const response = createResponse({
          fallbackContent: error.text ?? null,
          fallbackFinishReason: error.finishReason,
          fallbackModel: this.options.model,
          metadata: error.response,
          usage: error.usage,
        });

        this.logCompletedResponse(context, startedAt, response);
        return response;
      }

      logger.error(
        {
          event: logEvents.llmRequestFailed,
          ...context,
          durationMs: Math.round(performance.now() - startedAt),
          error: serializeError(error),
        },
        "LLM request failed",
      );

      if (isTimeoutError(error)) {
        throw new LlmProviderTimeoutError(error);
      }

      throw new LlmProviderRequestError(error);
    }
  }

  private logCompletedResponse(
    context: {
      readonly requestId: string;
      readonly operation: string;
      readonly provider: "moonshot";
      readonly model: string;
    },
    startedAt: number,
    response: StructuredOutputModelResponse,
  ): void {
    const completedContext = {
      ...context,
      model: response.model,
      durationMs: Math.round(performance.now() - startedAt),
      finishReason: response.finishReason,
      ...(response.usage ? { usage: response.usage } : {}),
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
  }
}

export function createAiSdkKimiClientFromEnvironment(): StructuredOutputModelClient {
  const apiKey = process.env.MOONSHOT_API_KEY?.trim();

  if (!apiKey) {
    throw new MissingLlmConfigurationError();
  }

  return new AiSdkKimiClient({
    apiKey,
    baseUrl: process.env.MOONSHOT_BASE_URL?.trim() || DEFAULT_BASE_URL,
    model: process.env.LLM_MODEL?.trim() || DEFAULT_MODEL,
    debugRawOutput:
      process.env.NODE_ENV === "development" &&
      process.env.LLM_DEBUG_OUTPUT === "true",
  });
}
