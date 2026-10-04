import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { TripWorkspace } from "@/components/trip-workspace/trip-workspace";
import { TripNotFoundError } from "@/domain/trip/trip-errors";
import { readGuestId } from "@/platform/identity/guest-identity";
import { TripStateNotFoundError } from "@/capabilities/journey/journey-errors";
import { journeyService } from "@/capabilities/journey/journey-service-instance";
import { tripMessageService } from "@/capabilities/conversation/trip-message-service-instance";
import { imagesShownInConversation, selectedPlaceImages, type SelectedPlaceImage } from "@/capabilities/destination/place-images";
import type { TripMessage } from "@/domain/trip-message/trip-message";
import type { TripState } from "@/domain/trip-state/trip-state";
import { AmapPlacePhotoProvider } from "@/platform/place-photos/amap-place-photo-provider";

import { messages } from "@/components/i18n/messages";
import { requestLocale } from "@/platform/locale/request-locale";
import styles from "@/components/trip-workspace/trip-workspace.module.css";

export async function generateMetadata(): Promise<Metadata> {
  return { title: messages[await requestLocale()].workspace.pageTitle };
}

export const dynamic = "force-dynamic";

export default async function TripWorkspacePage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id: tripId } = await params;
  const ownerGuestId = readGuestId(await cookies());

  if (!ownerGuestId) {
    notFound();
  }

  let journey: Awaited<ReturnType<typeof journeyService.loadJourney>> | null =
    null;

  try {
    journey = await journeyService.loadJourney(tripId, ownerGuestId);
  } catch (error) {
    if (error instanceof TripNotFoundError) {
      notFound();
    }

    if (error instanceof TripStateNotFoundError) {
      journey = null;
    } else {
      throw error;
    }
  }

  if (journey === null) {
    return <MissingTripState />;
  }

  const initialMessages = await tripMessageService.listMessages(
    journey.trip.id,
    ownerGuestId,
  );

  return (
    <TripWorkspace
      initialMessages={initialMessages}
      initialPlacePhotos={await initialPlacePhotos(journey.tripState, initialMessages)}
      initialTripState={journey.tripState}
      tripId={journey.trip.id}
    />
  );
}

/**
 * Photos arrive with the page, so a reload shows them at once. A cold lookup is not
 * worth holding the whole Journey for, though: past a short wait the page renders
 * without them and the browser asks once it is open.
 */
async function initialPlacePhotos(
  tripState: TripState,
  messages: readonly TripMessage[],
): Promise<readonly SelectedPlaceImage[] | null> {
  const areas = tripState.destination.state === "known" ? tripState.destination.areas : [];
  if (areas.length === 0) return [];
  const lookup = selectedPlaceImages(areas, new AmapPlacePhotoProvider(), imagesShownInConversation(messages))
    .catch(() => null);
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 1_500));
  return Promise.race([lookup, timeout]);
}

async function MissingTripState() {
  const text = messages[await requestLocale()].workspace;
  return (
    <main className={styles.missingWorkspace}>
      <Image
        alt="Meri"
        height={329}
        src="/brand/meri-wordmark.svg"
        width={1101}
      />
      <p>{text.stateMissing}</p>
      <Link href="/">{text.toHome}</Link>
    </main>
  );
}
