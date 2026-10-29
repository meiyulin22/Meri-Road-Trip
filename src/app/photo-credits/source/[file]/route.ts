import { loadPhotoCatalog } from "@/platform/place-photos/catalog-photo-provider";
import { mediaPhotoStoreFromEnvironment, type MediaPhotoStore } from "@/platform/place-photos/media-photo-store";
import { parsePixabayArtistUrl, type PhotoCatalog } from "@/platform/place-photos/photo-catalog";

function pixabayPhotoPage(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.host === "pixabay.com" && !url.username && !url.password &&
      !url.search && !url.hash && /^\/(?:[a-z]{2}\/)?(?:photos\/)?[^/]+-\d+\/$/u.test(url.pathname)
      ? url.href : null;
  } catch {
    return null;
  }
}

function commonsFilePage(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.host === "commons.wikimedia.org" && !url.username && !url.password &&
      !url.search && !url.hash && url.pathname.startsWith("/wiki/File:") && url.pathname.length > "/wiki/File:".length
      ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * A Commons licence link Meri may show: the licence deed on creativecommons.org, or the file's
 * own Commons page (public-domain files have no licence page). Anything else is dropped.
 */
function licenceLink(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return null;
    return url.host === "creativecommons.org" || (url.host === "commons.wikimedia.org" && url.pathname.startsWith("/wiki/File:"))
      ? url.href : null;
  } catch {
    return null;
  }
}

/** Resolve stored filenames so old cards also reach their photographer or original photo. */
export async function handlePhotoCreditGet(
  file: string, catalog: PhotoCatalog, store: MediaPhotoStore | null, asJson = false,
): Promise<Response> {
  if (!/^[a-z0-9][a-z0-9-]*\.(?:jpe?g|png|webp|avif)$/u.test(file)) {
    return new Response("Not found.", { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  const entry = Object.values(catalog).find((photo) => photo.file === file) ?? await store?.readPhotoCredit(file);
  if (!entry) return new Response("Not found.", { status: 404, headers: { "Cache-Control": "no-store" } });
  const source = entry.source ?? "pixabay";
  const target = source === "wikimedia" ? commonsFilePage(entry.pageUrl)
    : parsePixabayArtistUrl(entry.artistUrl) ?? pixabayPhotoPage(entry.pageUrl);
  if (!target) return new Response("Not found.", { status: 404, headers: { "Cache-Control": "no-store" } });
  // Creative Commons asks for the licence and a link to it next to the credit, so Commons answers carry both.
  const license = source === "wikimedia" && entry.license?.trim() ? entry.license.trim().slice(0, 40) : null;
  const licenseUrl = license ? licenceLink(entry.licenseUrl) : null;
  if (asJson) {
    return Response.json({ url: target, artist: entry.artist, source, ...(license ? { license } : {}),
      ...(licenseUrl ? { licenseUrl } : {}) }, { headers: { "Cache-Control": "no-store" } });
  }
  return new Response(null, { status: 307, headers: { Location: target, "Cache-Control": "no-store" } });
}

export async function GET(request: Request, { params }: { params: Promise<{ file: string }> }): Promise<Response> {
  const { file } = await params;
  return handlePhotoCreditGet(file, loadPhotoCatalog(), mediaPhotoStoreFromEnvironment(),
    new URL(request.url).searchParams.get("format") === "json");
}
