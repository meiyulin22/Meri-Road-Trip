import { UserRound } from "lucide-react";
import Image from "next/image";
import { cookies } from "next/headers";

import { journeySummaryRepository } from "@/capabilities/journey/journey-summary-repository-instance";
import { loadMyJourneys } from "@/capabilities/journey/my-journeys";
import { journeyCovers } from "@/capabilities/journey/journey-covers";
import { tripMessageService } from "@/capabilities/conversation/trip-message-service-instance";
import { readGuestId } from "@/platform/identity/guest-identity";
import { AmapPlacePhotoProvider } from "@/platform/place-photos/amap-place-photo-provider";
import { messages } from "@/components/i18n/messages";
import { requestLocale } from "@/platform/locale/request-locale";

import { LanguageToggle } from "../ui/language-toggle";
import { PixelHeading } from "../ui/pixel-heading-character";
import { HomeEntrance } from "./home-entrance";
import styles from "./meri-app-shell.module.css";
import { NewTripComposer } from "./new-trip-composer";
import { RecentJourneys } from "./recent-journeys";
import { recentJourneysForHome } from "./recent-journeys-model";

export async function MeriAppShell() {
  const cookieStore = await cookies();
  const journeys = recentJourneysForHome(
    await loadMyJourneys(cookieStore, journeySummaryRepository),
  );
  const ownerGuestId = readGuestId(cookieStore);
  // A short wait, as on the Workspace: photos it has seen come from the cache at once.
  const covers = ownerGuestId ? await journeyCovers(journeys, {
    listMessages: (tripId) => tripMessageService.listMessages(tripId, ownerGuestId),
    photos: new AmapPlacePhotoProvider(),
    waitMs: 1_500,
  }) : {};
  const locale = await requestLocale();
  const text = messages[locale].home;

  return (
    <main className={styles.appShell}>
      <header className={styles.topBar}>
        <button
          aria-label={text.profileUnavailable}
          className={styles.profileButton}
          disabled
          type="button"
        >
          <UserRound aria-hidden="true" size={19} strokeWidth={1.7} />
          <span>{text.profile}</span>
        </button>
        <LanguageToggle />
      </header>

      <HomeEntrance
        brand={
          <div className={styles.brand} role="img" aria-label="Meri">
            <Image
              alt=""
              className={styles.brandMark}
              height={887}
              priority
              src="/brand/meri-home-mountain.png"
              unoptimized
              width={1774}
            />
            <PixelHeading
              aria-hidden="true"
              as="h2"
              className={styles.brandName}
              cycleInterval={180}
              defaultFontIndex={0}
              interactionCycles={1}
              mode="uniform"
              tabIndex={-1}
            >
              Meri
            </PixelHeading>
          </div>
        }
        className={styles.entry}
        composer={<NewTripComposer />}
        headline={locale === "zh" ? (
          // Pixel letters are Latin only; the Chinese headline is plain system type.
          <h1 className={`${styles.headlineName} ${styles.headlineChinese}`} id="home-title" tabIndex={-1}>
            {text.headline}
          </h1>
        ) : (
          <PixelHeading
            as="h1"
            className={styles.headlineName}
            defaultFontIndex={0}
            id="home-title"
            mode="uniform"
            tabIndex={-1}
          >
            {text.headline}
          </PixelHeading>
        )}
        recentJourneys={journeys.length > 0 ? <RecentJourneys covers={covers} journeys={journeys} /> : null}
      />

      <div className={styles.landscape} aria-hidden="true" />
      <Image
        alt=""
        aria-hidden="true"
        className={styles.companion}
        height={1024}
        src="/companion/home-v2-companion.png"
        unoptimized
        width={1536}
      />
    </main>
  );
}
