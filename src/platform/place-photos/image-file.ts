/**
 * What a downloaded file really is, read from its bytes rather than from the server's
 * Content-Type: a photo is published only when its signature and its own dimensions
 * say it is one of the formats the browser and the image optimizer both handle.
 */
export type ImageFormat = "jpg" | "png" | "webp";

export interface ImageFacts {
  readonly format: ImageFormat;
  readonly width: number;
  readonly height: number;
}

export const contentTypeOf: Readonly<Record<ImageFormat, string>> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

function pngSize(body: Uint8Array): ImageFacts | null {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (body.length < 24 || !signature.every((byte, index) => body[index] === byte)) return null;
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
  // The first chunk is always IHDR: width and height are its first eight bytes.
  if (String.fromCharCode(...body.subarray(12, 16)) !== "IHDR") return null;
  return { format: "png", width: view.getUint32(16), height: view.getUint32(20) };
}

function jpegSize(body: Uint8Array): ImageFacts | null {
  if (body.length < 4 || body[0] !== 0xff || body[1] !== 0xd8) return null;
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
  let offset = 2;
  while (offset + 9 < body.length) {
    if (body[offset] !== 0xff) return null;
    const marker = body[offset + 1];
    // Padding bytes, and markers that carry no length, have no segment to skip.
    if (marker === 0xff) { offset += 1; continue; }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { offset += 2; continue; }
    const length = view.getUint16(offset + 2);
    if (length < 2) return null;
    // Start-of-frame markers, except DHT (C4), JPG (C8) and DAC (CC), hold the size.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { format: "jpg", height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) };
    }
    offset += 2 + length;
  }
  return null;
}

/** Little-endian 24-bit read; DataView has no getUint24. */
function uint24(body: Uint8Array, offset: number): number {
  return body[offset] | (body[offset + 1] << 8) | (body[offset + 2] << 16);
}

function webpSize(body: Uint8Array): ImageFacts | null {
  if (body.length < 30 || String.fromCharCode(...body.subarray(0, 4)) !== "RIFF" ||
    String.fromCharCode(...body.subarray(8, 12)) !== "WEBP") return null;
  const chunk = String.fromCharCode(...body.subarray(12, 16));
  if (chunk === "VP8X") return { format: "webp", width: uint24(body, 24) + 1, height: uint24(body, 27) + 1 };
  if (chunk === "VP8 ") {
    // A lossy key frame: three-byte start code, then 14-bit width and height.
    if (body[23] !== 0x9d || body[24] !== 0x01 || body[25] !== 0x2a) return null;
    return { format: "webp", width: (body[26] | (body[27] << 8)) & 0x3fff, height: (body[28] | (body[29] << 8)) & 0x3fff };
  }
  if (chunk === "VP8L") {
    if (body[20] !== 0x2f) return null;
    const bits = body[21] | (body[22] << 8) | (body[23] << 16) | (body[24] << 24);
    return { format: "webp", width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  return null;
}

/** The file's format and size, or null when it is not a well-formed JPEG, PNG or WebP. */
export function readImageFacts(body: Uint8Array): ImageFacts | null {
  const facts = jpegSize(body) ?? pngSize(body) ?? webpSize(body);
  return facts && facts.width > 0 && facts.height > 0 ? facts : null;
}
