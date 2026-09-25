import { randomUUID } from "node:crypto";

import { AmapInputTipsProvider } from "@/infrastructure/location/amap-input-tips-provider";
import {
  InvalidLocationSuggestionQueryError,
  LocationSuggestionProviderError,
  LocationSuggestionService,
} from "@/server/location/location-suggestion-service";
import { logger, logEvents } from "@/server/observability/logger";

function errorResponse(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

export async function handleLocationSuggestionsGet(
  request: Request,
  service: LocationSuggestionService,
): Promise<Response> {
  const requestId = randomUUID();
  const startedAt = performance.now();

  try {
    const query = new URL(request.url).searchParams.get("q") ?? "";
    const suggestions = await service.suggest(query);
    logger.info({
      event: logEvents.locationSuggestionsCompleted,
      requestId,
      provider: "amap",
      resultCount: suggestions.length,
      durationMs: Math.round(performance.now() - startedAt),
    }, "Location suggestions completed");
    return Response.json({ suggestions });
  } catch (error) {
    const status = error instanceof InvalidLocationSuggestionQueryError ? 400
      : error instanceof LocationSuggestionProviderError && error.reason === "missing_configuration" ? 503
        : error instanceof LocationSuggestionProviderError && error.reason === "timeout" ? 504
          : 502;
    const reason = error instanceof InvalidLocationSuggestionQueryError ? "invalid_query"
      : error instanceof LocationSuggestionProviderError ? error.reason : "unexpected_error";
    logger.warn({
      event: logEvents.locationSuggestionsFailed,
      requestId,
      provider: "amap",
      reason,
      statusCode: status,
      durationMs: Math.round(performance.now() - startedAt),
    }, "Location suggestions failed");
    return errorResponse(status, reason, status === 400
      ? "Query must contain 1 to 80 characters."
      : "Location suggestions are temporarily unavailable.");
  }
}

export async function GET(request: Request): Promise<Response> {
  return handleLocationSuggestionsGet(
    request,
    new LocationSuggestionService(new AmapInputTipsProvider()),
  );
}
