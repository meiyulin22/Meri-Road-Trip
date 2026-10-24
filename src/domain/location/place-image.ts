/**
 * A representative photo for a place, shown on cards and in the Journey column. It
 * decorates a place the user chose or was offered; it is never evidence of what the
 * place is like now, and a place without one is an ordinary case, not an error.
 * Only the link is stored — the image itself stays with the provider, or in Meri's own
 * media storage for a photo downloaded at run time.
 */
export interface PlaceImage {
  /**
   * https only for an external host: the PWA is served over https, and an http image is
   * blocked as mixed content. A root-relative path (`/photos/potala-palace.jpg`) is also
   * accepted: it is our own copy on our own origin, which is https wherever the page is,
   * as is a photo Meri downloaded at run time (`/media/place-photos/pixabay-<id>.jpg`,
   * `/media/place-photos/wikimedia-<id>.jpg`).
   */
  readonly url: string;
  /** What the photo shows, in the provider's words: 玉龙雪山国家级风景名胜区. */
  readonly caption: string;
  /**
   * Who took it and under what licence, where the licence asks to be shown. Absent for
   * a provider's own photos: Amap's carry none.
   */
  readonly credit?: string;
}

/**
 * The version of the rules that decide a recommendation card has no photo. A card saved
 * with no photo under older rules is looked up once more under these (and then carries
 * this number), and a remote "nothing suitable" decided under older rules no longer
 * counts. 1: 1.0624, English name only. 2: 1.0625, aliases, Chinese search, stand-in
 * landmarks. 3: 1.0627, Chinese regions read tag by tag (玄武湖, 南京 is not 湖南), and
 * aliases that only name a region no longer identify a landmark. 4: 1.0633, the landmark's
 * Wikidata item and its P18 image on Wikimedia Commons are asked before Pixabay.
 */
export const placePhotoRulesVersion = 4;

/** The only names the runtime photo route serves (media-photo-store.ts). */
const runtimePhotoUrl = /^\/media\/place-photos\/(?:pixabay|wikimedia)-[1-9]\d{0,11}\.(?:jpg|png|webp)$/u;

export function parsePlaceImage(value: unknown): PlaceImage | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const { url, caption, credit } = value as Record<string, unknown>;
  if (typeof url !== "string" || url.length > 500 || typeof caption !== "string" ||
    caption.trim() === "" || caption.length > 60) {
    return null;
  }
  const validCredit = typeof credit === "string" && credit.trim() !== "" && credit.length <= 120 ? credit.trim() : null;
  // Our own copy of a photo lives under /photos (shipped with the app) or, when Meri
  // downloaded it while running, under /media/place-photos — both on this origin.
  if ((url.startsWith("/photos/") && !url.includes("..")) || runtimePhotoUrl.test(url)) {
    return { url, caption: caption.trim(), ...(validCredit ? { credit: validCredit } : {}) };
  }
  try {
    return new URL(url).protocol === "https:"
      ? { url, caption: caption.trim(), ...(validCredit ? { credit: validCredit } : {}) } : null;
  } catch {
    return null;
  }
}
