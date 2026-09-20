import pino from "pino";

// Event names are stable, lowercase, dot-separated identifiers:
// <area>.<action>[.<state>].
export const logEvents = {
  httpRequestStarted: "http.request.started",
  httpRequestCompleted: "http.request.completed",
  httpRequestFailed: "http.request.failed",
  healthCheckCompleted: "health.check.completed",
  tripCreated: "trip.created",
  tripLoaded: "trip.loaded",
  tripNotFound: "trip.not_found",
  tripCreateFailed: "trip.create.failed",
  tripLoadFailed: "trip.load.failed",
  llmRequestStarted: "llm.request.started",
  llmRequestCompleted: "llm.request.completed",
  llmRequestFailed: "llm.request.failed",
  llmRawOutput: "llm.raw_output",
  llmOutputInvalid: "llm.output.invalid",
  workspaceConversationRequested: "workspace.conversation.requested",
  workspaceConversationInterpreted: "workspace.conversation.interpreted",
  workspaceConversationFailed: "workspace.conversation.failed",
  tripStateUpdateApplied: "trip_state.update.applied",
} as const;

const isDevelopment = process.env.NODE_ENV === "development";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isDevelopment ? "debug" : "info"),
  base: {
    service: "meri",
  },
  redact: {
    paths: [
      "password",
      "token",
      "apiKey",
      "authorization",
      "*.password",
      "*.token",
      "*.apiKey",
      "*.authorization",
    ],
    censor: "[REDACTED]",
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  transport: isDevelopment
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          singleLine: true,
          translateTime: "SYS:standard",
        },
      }
    : undefined,
});
