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
  if (asJson) return Response.json({ url: target, artist: entry.artist, source }, { headers: { "Cache-Control": "no-store" } });
  return new Response(null, { status: 307, headers: { Location: target, "Cache-Control": "no-store" } });
}

export async function GET(request: Request, { params }: { params: Promise<{ file: string }> }): Promise<Response> {
  const { file } = await params;
  return handlePhotoCreditGet(file, loadPhotoCatalog(), mediaPhotoStoreFromEnvironment(),
    new URL(request.url).searchParams.get("format") === "json");
}
