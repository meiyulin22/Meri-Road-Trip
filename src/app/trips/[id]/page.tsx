import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { TripWorkspace } from "@/components/trip-workspace/trip-workspace";
import { TripNotFoundError } from "@/domain/trip/trip-errors";
import { readGuestId } from "@/server/identity/guest-identity";
import { TripStateNotFoundError } from "@/server/journey/journey-errors";
import { journeyService } from "@/server/journey/journey-service-instance";
import { tripMessageService } from "@/server/trip-message/trip-message-service-instance";

import styles from "@/components/trip-workspace/trip-workspace.module.css";

export const metadata: Metadata = {
  title: "Journey | Meri",
};

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
      initialTripState={journey.tripState}
      tripId={journey.trip.id}
    />
  );
}

function MissingTripState() {
  return (
    <main className={styles.missingWorkspace}>
      <Image
        alt="Meri"
        height={329}
        src="/brand/meri-wordmark.svg"
        width={1101}
      />
      <p>这个旅程缺少必要的状态数据，Meri 没有擅自创建替代内容。</p>
      <Link href="/">回到首页</Link>
    </main>
  );
}
