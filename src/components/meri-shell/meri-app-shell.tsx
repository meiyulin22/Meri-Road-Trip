import { UserRound } from "lucide-react";
import Image from "next/image";
import { cookies } from "next/headers";

import { journeySummaryRepository } from "@/server/journey/journey-summary-repository-instance";
import { loadMyJourneys } from "@/server/journey/my-journeys";

import { PixelHeading } from "../ui/pixel-heading-character";
import { HomeEntrance } from "./home-entrance";
import styles from "./meri-app-shell.module.css";
import { NewTripComposer } from "./new-trip-composer";
import { RecentJourneys } from "./recent-journeys";
import { recentJourneysForHome } from "./recent-journeys-model";

export async function MeriAppShell() {
  const journeys = recentJourneysForHome(
    await loadMyJourneys(await cookies(), journeySummaryRepository),
  );

  return (
    <main className={styles.appShell}>
      <header className={styles.topBar}>
        <button
          aria-label="Profile is not available yet"
          className={styles.profileButton}
          disabled
          type="button"
        >
          <UserRound aria-hidden="true" size={19} strokeWidth={1.7} />
          <span>Profile</span>
        </button>
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
        className={`${styles.entry} ${journeys.length > 0 ? styles.entryWithRecent : ""}`}
        composer={<NewTripComposer />}
        headline={
          <PixelHeading
            as="h1"
            className={styles.headlineName}
            defaultFontIndex={0}
            id="home-title"
            mode="uniform"
            tabIndex={-1}
          >
            Where do you want to go?
          </PixelHeading>
        }
        recentJourneys={journeys.length > 0 ? <RecentJourneys journeys={journeys} /> : null}
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
