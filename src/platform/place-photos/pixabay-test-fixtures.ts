/**
 * Test-only fixtures for the runtime photo tests: a JPEG the size checks accept, a
 * Pixabay hit, and a fetch that answers from a script and counts what was asked.
 * Nothing here reaches the network.
 */
import type { PixabayHit } from "./pixabay-photo-match";

/** A JPEG header carrying the given size, padded to `bytes` so the minimum-size check passes. */
export function fakeJpeg(width: number, height: number, bytes = 20_000): Uint8Array {
  const header = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x03];
  const body = new Uint8Array(Math.max(bytes, header.length));
  body.set(header);
  return body;
}

export function hit(id: number, tags: string, overrides: Partial<PixabayHit> = {}): PixabayHit {
  return { id, tags, pageURL: `https://pixabay.com/photos/${tags.replace(/[^a-z]+/gu, "-")}-${id}/`,
    webformatURL: `https://pixabay.com/get/g${id}_640.jpg`, imageWidth: 4000, imageHeight: 2600, user: "uploader", ...overrides };
}

export interface ScriptedFetch {
  readonly fetcher: typeof fetch;
  /** Every URL asked for, with the key replaced, in order. */
  readonly asked: string[];
  searches(): number;
  downloads(): number;
}

/** A fetch whose searches and downloads are answered by the given functions. */
export function scriptedFetch(answer: {
  search?: (query: string) => Response | Promise<Response>;
  download?: (url: string) => Response | Promise<Response>;
}): ScriptedFetch {
  const asked: string[] = [];
  const fetcher = (async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    if (url.searchParams.has("key")) url.searchParams.set("key", "[KEY]");
    asked.push(url.toString());
    if (url.pathname === "/api/") {
      return answer.search ? answer.search(url.searchParams.get("q") ?? "") : Response.json({ hits: [] });
    }
    return answer.download ? answer.download(url.toString())
      : new Response(fakeJpeg(960, 640) as BodyInit, { headers: { "content-type": "image/jpeg" } });
  }) as typeof fetch;
  return { fetcher, asked,
    searches: () => asked.filter((url) => new URL(url).pathname === "/api/").length,
    downloads: () => asked.filter((url) => new URL(url).pathname !== "/api/").length };
}

export function searchAnswer(hits: readonly PixabayHit[]): Response {
  return Response.json({ total: hits.length, totalHits: hits.length, hits });
}
