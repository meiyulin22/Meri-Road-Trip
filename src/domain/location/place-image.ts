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
  /**
   * Who took it and under what licence, where the licence asks to be shown —
   * Wikimedia Commons photos do: 「Brücke-Osteuropa · Public domain · Wikimedia Commons」.
   * Absent for a provider's own photos.
   */
  readonly credit?: string;
}

export function parsePlaceImage(value: unknown): PlaceImage | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const { url, caption, credit } = value as Record<string, unknown>;
  if (typeof url !== "string" || url.length > 500 || typeof caption !== "string" ||
    caption.trim() === "" || caption.length > 60) {
    return null;
  }
  const validCredit = typeof credit === "string" && credit.trim() !== "" && credit.length <= 120 ? credit.trim() : null;
  try {
    return new URL(url).protocol === "https:"
      ? { url, caption: caption.trim(), ...(validCredit ? { credit: validCredit } : {}) } : null;
  } catch {
    return null;
  }
}
