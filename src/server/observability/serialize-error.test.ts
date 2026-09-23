import assert from "node:assert/strict";
import test from "node:test";

import { serializeError } from "./serialize-error";

test("redacts provider credentials from error messages, stacks, and causes", () => {
  const originalKey = process.env.MOONSHOT_API_KEY;
  process.env.MOONSHOT_API_KEY = "test-secret-value";
  try {
    const cause = new Error("request failed for ak-test123 and test-secret-value");
    const error = new Error("https://example.test/path?key=test-secret-value", { cause });
    const serialized = serializeError(error);

    assert.equal(JSON.stringify(serialized).includes("ak-test123"), false);
    assert.equal(JSON.stringify(serialized).includes("test-secret-value"), false);
    assert.equal(serialized.cause?.message, "request failed for [REDACTED] and [REDACTED]");
  } finally {
    if (originalKey === undefined) delete process.env.MOONSHOT_API_KEY;
    else process.env.MOONSHOT_API_KEY = originalKey;
  }
});
