import { randomUUID } from "node:crypto";

import { cookies } from "next/headers";

import {
  recommendationsAwaitingPhoto,
  type DestinationRecommendationPresentation,
  type TripMessage,
} from "@/domain/trip-message/trip-message";
import { TripNotFoundError } from "@/domain/trip/trip-errors";
import { readGuestId } from "@/platform/identity/guest-identity";
import { logEvents, logger } from "@/platform/observability/logger";
import { serializeError } from "@/platform/observability/serialize-error";
import { AmapPlacePhotoProvider } from "@/platform/place-photos/amap-place-photo-provider";
import type { PlacePhotoProvider } from "@/platform/place-photos/place-photo-provider";
import { findRecommendationPhotos } from "@/capabilities/recommendation/recommendation-photos";

type Dependencies = {
  readonly listMessages: (tripId: string, ownerGuestId: string) => Promise<readonly TripMessage[]>;
  readonly photos: PlacePhotoProvider;
  readonly savePhotos: (input: {
    tripId: string; ownerGuestId: string; messageId: string; presentation: DestinationRecommendationPresentation;
  }) => Promise<void>;
};

/**
 * One JSON object per line, sent as each photo is found. A proxy that buffers (nginx
 * by default) would hold every line until the end, so it is asked not to.
 */
const streamHeaders = {
  "Content-Type": "application/x-ndjson; charset=utf-8",
  "Cache-Control": "private, no-store, no-transform",
  "X-Accel-Buffering": "no",
};

/**
 * Photos for recommendation cards that are already on screen. Each card's answer is
 * streamed as one line the moment it is known — `{"id":…,"image":{url,caption}|null}` —
 * and the end of the stream means every card has its answer. They are then saved into
 * the card message, so a reload shows them without asking again.
 *
 * The lookups run to the end even if the browser goes away, so the photos are still
 * saved; a failed save only costs a second lookup the next time the cards are shown.
 */
export async function handleRecommendationPhotosPost(
  tripId: string,
  ownerGuestId: string | null,
  body: unknown,
  requestId: string,
  dependencies: Dependencies,
): Promise<Response> {
  if (!ownerGuestId) return Response.json({ error: "Journey not found." }, { status: 404 });
  if (typeof body !== "object" || body === null || Array.isArray(body) || Object.keys(body).length !== 1 ||
    !("messageId" in body) || typeof body.messageId !== "string" || !body.messageId.trim()) {
    return Response.json({ error: "Invalid photo request." }, { status: 400 });
  }
  const messageId = body.messageId;
  let presentation: DestinationRecommendationPresentation;
  try {
    const message = (await dependencies.listMessages(tripId, ownerGuestId)).find((item) => item.id === messageId);
    if (message?.presentation?.type !== "destination_recommendations") {
      return Response.json({ error: "Recommendation cards not found." }, { status: 404 });
    }
    presentation = message.presentation;
  } catch (error) {
    if (error instanceof TripNotFoundError) return Response.json({ error: "Journey not found." }, { status: 404 });
    logger.error({ event: logEvents.recommendationPhotosFailed, requestId, tripId, messageId, error: serializeError(error) },
      "Recommendation photos could not load the cards");
    return Response.json({ error: "Photos are unavailable." }, { status: 500 });
  }

  if (recommendationsAwaitingPhoto(presentation).length === 0) {
    return new Response(null, { headers: streamHeaders });
  }

  const encoder = new TextEncoder();
  let open = true;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (line: unknown) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
        } catch {
          // The browser went away; keep looking so the photos are still saved.
          open = false;
        }
      };
      void (async () => {
        try {
          const found = await findRecommendationPhotos(presentation, dependencies.photos, send);
          await dependencies.savePhotos({ tripId, ownerGuestId, messageId, presentation: found });
        } catch (error) {
          logger.error({ event: logEvents.recommendationPhotosFailed, requestId, tripId, messageId,
            error: serializeError(error) }, "Recommendation photos could not be saved");
        }
        if (open) controller.close();
      })();
    },
    cancel() {
      // Nothing to stop: the lookups finish and save on their own, just unheard.
      open = false;
    },
  });
  return new Response(stream, { headers: streamHeaders });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  let body: unknown;
  try { body = await request.json(); }
  catch { return Response.json({ error: "Invalid photo request." }, { status: 400 }); }
  const { tripMessageService } = await import("@/capabilities/conversation/trip-message-service-instance");
  return handleRecommendationPhotosPost(id, readGuestId(await cookies()), body, randomUUID(), {
    listMessages: (tripId, owner) => tripMessageService.listMessages(tripId, owner),
    photos: new AmapPlacePhotoProvider(),
    savePhotos: (input) => tripMessageService.saveRecommendationPhotos(input),
  });
}
