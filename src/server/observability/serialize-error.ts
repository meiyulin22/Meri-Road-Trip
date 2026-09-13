export type SerializedError = {
  name: string;
  message: string;
  stack?: string;
  cause?: SerializedError;
};

export function serializeError(error: unknown): SerializedError {
  if (!(error instanceof Error)) {
    return {
      name: "NonErrorThrown",
      message: String(error),
    };
  }

  return {
    name: error.name,
    message: error.message,
    ...(error.stack ? { stack: error.stack } : {}),
    ...(error.cause !== undefined
      ? { cause: serializeError(error.cause) }
      : {}),
  };
}
