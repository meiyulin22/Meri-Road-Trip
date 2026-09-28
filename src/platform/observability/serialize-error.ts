export type SerializedError = {
  name: string;
  message: string;
  stack?: string;
  cause?: SerializedError;
};

function redactErrorText(value: string): string {
  let redacted = value
    .replace(/ak-[A-Za-z0-9]+/g, "[REDACTED]")
    .replace(/([?&]key=)[^&\s)]+/gi, "$1[REDACTED]")
    .replace(/(Bearer\s+)[^\s]+/gi, "$1[REDACTED]");

  for (const key of [process.env.MOONSHOT_API_KEY, process.env.AMAP_API_KEY]) {
    if (key && key.length >= 4) {
      redacted = redacted.replaceAll(key, "[REDACTED]");
    }
  }

  return redacted;
}

export function serializeError(error: unknown): SerializedError {
  if (!(error instanceof Error)) {
    return {
      name: "NonErrorThrown",
      message: redactErrorText(String(error)),
    };
  }

  return {
    name: redactErrorText(error.name),
    message: redactErrorText(error.message),
    ...(error.stack ? { stack: redactErrorText(error.stack) } : {}),
    ...(error.cause !== undefined
      ? { cause: serializeError(error.cause) }
      : {}),
  };
}
