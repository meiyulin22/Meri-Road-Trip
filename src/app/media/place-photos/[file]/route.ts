import { mediaPhotoStoreFromEnvironment, type MediaPhotoStore } from "@/platform/place-photos/media-photo-store";

/**
 * A photo Meri downloaded while running, served from the media directory on this
 * origin. Production's `public/` is fixed when the server starts, so these files are
 * read on request instead and a new download is served without a restart. Only names
 * Meri itself writes are accepted, and only once the file and its record are complete.
 * A photo's name holds its Pixabay ID and never changes, so browsers may keep it.
 */
export async function handleMediaPhotoGet(file: string, store: MediaPhotoStore | null): Promise<Response> {
  const found = store ? await store.readPublished(file) : null;
  if (!found) return new Response("Not found.", { status: 404, headers: { "Cache-Control": "no-store" } });
  return new Response(found.body as BodyInit, { headers: {
    "Content-Type": found.contentType,
    "Content-Length": String(found.body.byteLength),
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
  } });
}

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }): Promise<Response> {
  const { file } = await params;
  return handleMediaPhotoGet(file, mediaPhotoStoreFromEnvironment());
}
