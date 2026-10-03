/**
 * A representative photo for a place, shown on cards and in the Journey column. It
 * decorates a place the user chose or was offered; it is never evidence of what the
 * place is like now, and a place without one is an ordinary case, not an error.
 * Only the link is stored — the image itself stays with the provider.
 */
export interface PlaceImage {
  /** https only: the PWA is served over https, and an http image is blocked as mixed content. */
  readonly url: string;
  /** What the photo shows, in the provider's words: 玉龙雪山国家级风景名胜区. */
  readonly caption: string;
}

export function parsePlaceImage(value: unknown): PlaceImage | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const { url, caption } = value as Record<string, unknown>;
  if (typeof url !== "string" || url.length > 500 || typeof caption !== "string" ||
    caption.trim() === "" || caption.length > 60) {
    return null;
  }
  try {
    return new URL(url).protocol === "https:" ? { url, caption: caption.trim() } : null;
  } catch {
    return null;
  }
}
