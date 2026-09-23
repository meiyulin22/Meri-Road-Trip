import { ArrowLeft, ArrowRight, CalendarDays, MapPin, Plus } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { cookies } from "next/headers";

import type { JourneySummary } from "@/repositories/journey-summary-repository";
import { journeySummaryRepository } from "@/server/journey/journey-summary-repository-instance";
import { loadMyJourneys } from "@/server/journey/my-journeys";

import { JourneyDeleteAction } from "./journey-delete-action";
import styles from "./trips.module.css";

export const metadata: Metadata = {
  title: "My Journeys | Meri",
};

export const dynamic = "force-dynamic";

export default async function MyJourneysPage() {
  const journeys = await loadMyJourneys(await cookies(), journeySummaryRepository);

  return (
    <main className={styles.page}>
      <div className={styles.backdrop} aria-hidden="true" />
      <div className={styles.shell}>
        <header className={styles.header}>
          <Link aria-label="Meri home" className={styles.brand} href="/">
            <Image
              alt="Meri"
              height={329}
              priority
              src="/brand/meri-wordmark.svg"
              width={1101}
            />
          </Link>
          <div className={styles.headerActions}>
            <Link className={styles.homeLink} href="/">
              <ArrowLeft aria-hidden="true" size={17} />
              <span>Home</span>
            </Link>
            <Link className={styles.newJourney} href="/#new-trip">
              <Plus aria-hidden="true" size={18} />
              <span>New Journey</span>
            </Link>
          </div>
        </header>

        <section className={styles.content} aria-labelledby="journeys-title">
          <p className={styles.eyebrow}>Continue exploring</p>
          <h1 id="journeys-title">My Journeys</h1>
          <p className={styles.introduction}>
            Return to a saved Journey and continue from the state Meri already
            knows.
          </p>

          {journeys.length === 0 ? (
            <EmptyState />
          ) : (
            <ul className={styles.journeyList}>
              {journeys.map((journey) => (
                <JourneyCard journey={journey} key={journey.id} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

function JourneyCard({ journey }: { readonly journey: JourneySummary }) {
  return (
    <li className={styles.cardItem}>
      <Link
        aria-label={`Continue ${journey.name}`}
        className={styles.journeyCard}
        href={`/trips/${encodeURIComponent(journey.id)}`}
      >
        <div className={styles.cardHeading}>
          <div>
            <span className={styles.status}>{journey.status}</span>
            <h2>{journey.name}</h2>
          </div>
          <ArrowRight aria-hidden="true" size={22} />
        </div>

        <dl className={styles.journeyDetails}>
          <div>
            <dt>
              <MapPin aria-hidden="true" size={16} />
              Destination
            </dt>
            <dd>{journey.destination ?? "Not decided yet"}</dd>
          </div>
          <div>
            <dt>
              <CalendarDays aria-hidden="true" size={16} />
              Dates
            </dt>
            <dd>{formatDateRange(journey)}</dd>
          </div>
        </dl>

        <p className={styles.updatedAt}>
          Updated <time dateTime={journey.updatedAt}>{formatUpdatedAt(journey.updatedAt)}</time>
        </p>
      </Link>
      <JourneyDeleteAction name={journey.name} tripId={journey.id} />
    </li>
  );
}

function EmptyState() {
  return (
    <section className={styles.emptyState} aria-labelledby="empty-title">
      <Image
        alt=""
        height={1024}
        src="/brand/meri-mark.svg"
        width={1024}
      />
      <div>
        <h2 id="empty-title">No saved Journeys yet</h2>
        <p>
          Start with a destination, a season, or just the feeling that you want
          to go somewhere.
        </p>
        <Link href="/#new-trip">Create your first Journey</Link>
      </div>
    </section>
  );
}

function formatDateRange(journey: JourneySummary): string {
  if (journey.startDate && journey.endDate) {
    return journey.startDate === journey.endDate
      ? journey.startDate
      : `${journey.startDate} — ${journey.endDate}`;
  }

  if (journey.startDate) {
    return `From ${journey.startDate}`;
  }

  if (journey.endDate) {
    return `Until ${journey.endDate}`;
  }

  return "Flexible";
}

function formatUpdatedAt(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(value));
}
