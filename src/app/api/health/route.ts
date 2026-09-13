import { randomUUID } from "node:crypto";

import { logger, logEvents } from "@/server/observability/logger";
import { serializeError } from "@/server/observability/serialize-error";

export function GET(request: Request) {
  const requestId = randomUUID();
  const method = request.method;
  const path = new URL(request.url).pathname;
  const startedAt = performance.now();

  logger.info(
    {
      event: logEvents.httpRequestStarted,
      requestId,
      method,
      path,
    },
    "HTTP request started",
  );

  try {
    const response = Response.json({ status: "ok" });
    const durationMs = Math.round((performance.now() - startedAt) * 100) / 100;

    logger.info(
      {
        event: logEvents.healthCheckCompleted,
        requestId,
        method,
        path,
        durationMs,
      },
      "Health check completed",
    );

    logger.info(
      {
        event: logEvents.httpRequestCompleted,
        requestId,
        method,
        path,
        statusCode: response.status,
        durationMs,
      },
      "HTTP request completed",
    );

    return response;
  } catch (error) {
    const durationMs = Math.round((performance.now() - startedAt) * 100) / 100;

    logger.error(
      {
        event: logEvents.httpRequestFailed,
        requestId,
        method,
        path,
        durationMs,
        error: serializeError(error),
      },
      "HTTP request failed",
    );

    throw error;
  }
}
