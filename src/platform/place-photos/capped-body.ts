/**
 * Reads a response body up to `maxBytes`, counting the bytes that actually arrive, so a
 * missing or false Content-Length cannot overrun the cap. Shared by the Pixabay and
 * Wikimedia clients, whose downloads both go into the same media store.
 */
export async function readCappedBody(stream: ReadableStream<Uint8Array>, maxBytes: number):
  Promise<Uint8Array | "too_large" | "transient"> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return "too_large";
      }
      chunks.push(value);
    }
  } catch {
    return "transient";
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}
