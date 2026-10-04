import { ArrowLeft, ArrowRight, CalendarDays, MapPin, Plus } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { cookies } from "next/headers";

import type { JourneySummary } from "@/platform/persistence/journey-summary-repository";
import { journeySummaryRepository } from "@/capabilities/journey/journey-summary-repository-instance";
import { loadMyJourneys } from "@/capabilities/journey/my-journeys";
import { messages, type Messages } from "@/components/i18n/messages";
import { requestLocale } from "@/platform/locale/request-locale";

import { JourneyDeleteAction } from "./journey-delete-action";
import styles from "./trips.module.css";

export async function generateMetadata(): Promise<Metadata> {
  return { title: messages[await requestLocale()].journeys.pageTitle };
}

type JourneysText = Messages["journeys"];

export const dynamic = "force-dynamic";

export default async function MyJourneysPage() {
  const journeys = await loadMyJourneys(await cookies(), journeySummaryRepository);
  const text = messages[await requestLocale()];

  return (
    <main className={styles.page}>
      <div className={styles.backdrop} aria-hidden="true" />
      <div className={styles.shell}>
        <header className={styles.header}>
          <Link aria-label={text.workspace.homeLabel} className={styles.brand} href="/">
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
              <span>{text.journeys.home}</span>
            </Link>
            <Link className={styles.newJourney} href="/#new-trip">
              <Plus aria-hidden="true" size={18} />
              <span>{text.journeys.newJourney}</span>
            </Link>
          </div>
        </header>

        <section className={styles.content} aria-labelledby="journeys-title">
          <p className={styles.eyebrow}>{text.journeys.eyebrow}</p>
          <h1 id="journeys-title">{text.journeys.title}</h1>
          <p className={styles.introduction}>
            {text.journeys.introduction}
          </p>

          {journeys.length === 0 ? (
            <EmptyState text={text.journeys} />
          ) : (
            <ul className={styles.journeyList}>
              {journeys.map((journey) => (
                <JourneyCard journey={journey} key={journey.id} text={text.journeys} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

function JourneyCard({ journey, text }: { readonly journey: JourneySummary; readonly text: JourneysText }) {
  return (
    <li className={styles.cardItem}>
      <Link
        aria-label={text.continue(journey.name)}
        className={styles.journeyCard}
        href={`/trips/${encodeURIComponent(journey.id)}`}
      >
        <div className={styles.cardHeading}>
          <div>
            <span className={styles.status}>{text.status[journey.status]}</span>
            <h2>{journey.name}</h2>
          </div>
          <ArrowRight aria-hidden="true" size={22} />
        </div>

        <dl className={styles.journeyDetails}>
          <div>
            <dt>
              <MapPin aria-hidden="true" size={16} />
              {text.destination}
            </dt>
            <dd>{journey.destination ?? text.notDecided}</dd>
          </div>
          <div>
            <dt>
              <CalendarDays aria-hidden="true" size={16} />
              {text.dates}
            </dt>
            <dd>{formatDateRange(journey, text)}</dd>
          </div>
        </dl>

        <p className={styles.updatedAt}>
          {text.updated} <time dateTime={journey.updatedAt}>{text.updatedAt(new Date(journey.updatedAt))}</time>
        </p>
      </Link>
      <JourneyDeleteAction name={journey.name} tripId={journey.id} />
    </li>
  );
}

function EmptyState({ text }: { readonly text: JourneysText }) {
  return (
    <section className={styles.emptyState} aria-labelledby="empty-title">
      <Image
        alt=""
        height={1024}
        src="/brand/meri-mark.svg"
        width={1024}
      />
      <div>
        <h2 id="empty-title">{text.emptyTitle}</h2>
        <p>
          {text.emptyText}
        </p>
        <Link href="/#new-trip">{text.createFirst}</Link>
      </div>
    </section>
  );
}

function formatDateRange(journey: JourneySummary, text: JourneysText): string {
  if (journey.startDate && journey.endDate) {
    return journey.startDate === journey.endDate
      ? journey.startDate
      : `${journey.startDate} — ${journey.endDate}`;
  }

  if (journey.startDate) {
    return text.from(journey.startDate);
  }

  if (journey.endDate) {
    return text.until(journey.endDate);
  }

  return text.flexible;
}
