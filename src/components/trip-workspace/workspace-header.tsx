import { ArrowLeft, CalendarDays, CarFront, MapPin } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import type { SelectedPlaceImage } from "@/capabilities/destination/place-images";
import { useMessages } from "@/components/i18n/locale-context";
import type { TripState } from "@/domain/trip-state/trip-state";
import { getWorkspaceTitle } from "./workspace-title";
import { journeyDateLabel, journeyFieldLabel } from "./workspace-presentation";
import styles from "./trip-workspace.module.css";

export function WorkspaceHeader({ cover, tripState }: {
  readonly cover: SelectedPlaceImage | null;
  readonly tripState: TripState;
}) {
  const text = useMessages();
  const words = text.workspace;
  return (
    <>
      <header className={styles.header} data-region="header">
        <Link className={styles.brandLockup} href="/" aria-label={words.homeLabel}>
          <Image src="/brand/meri-home-mountain.png" width={52} height={40} alt="" />
          <span>Meri</span>
        </Link>
        <Link className={styles.homeLink} href="/">
          <ArrowLeft aria-hidden="true" size={16} />
          <span>{words.backHome}</span>
        </Link>
        <span className={styles.saveState}><i aria-hidden="true" />{words.drafting}<span>{words.saved}</span></span>
      </header>
      <section className={styles.journeyHeading} aria-labelledby="journey-title">
        {/* The Journey's first place is its cover; with none yet, the default landscape stays. */}
        <div className={styles.journeyThumbnail} aria-hidden="true">
          {cover ? <Image alt="" fill key={cover.image.url} sizes="104px" src={cover.image.url} /> : null}
        </div>
        <div className={styles.journeyHeadingText}>
          <p className={styles.journeyEyebrow}>{words.eyebrow}</p>
          <h1 id="journey-title">{getWorkspaceTitle(tripState, words.untitledJourney)}</h1>
          <p className={styles.journeySubtitle}>{words.subtitle}</p>
          <div className={styles.journeyMeta}>
            <span><CalendarDays size={15} aria-hidden="true" />{journeyDateLabel(tripState, text.dates, words.datesPending)}</span>
            <span><MapPin size={15} aria-hidden="true" />{journeyFieldLabel(tripState.origin, words.originPending)}</span>
            <span><CarFront size={15} aria-hidden="true" />{tripState.transportPreference.state === "known" ? text.brief.transportInHeader[tripState.transportPreference.value] : words.transportPending}</span>
          </div>
        </div>
      </section>
    </>
  );
}
