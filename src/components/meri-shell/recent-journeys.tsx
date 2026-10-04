"use client";

import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useReducedMotion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";

import { useMessages } from "@/components/i18n/locale-context";
import type { Messages } from "@/components/i18n/messages";
import type { JourneySummary } from "@/platform/persistence/journey-summary-repository";

import {
  recentJourneysArrowState,
  shouldLoopRecentJourneys,
  shouldOpenJourneyCard,
  visibleRecentJourneys,
} from "./recent-journeys-model";
import { RecentJourneyActions } from "./recent-journey-actions";
import styles from "./recent-journeys.module.css";

type RecentJourneysProps = {
  journeys: readonly JourneySummary[];
};

export function RecentJourneys({ journeys }: RecentJourneysProps) {
  const text = useMessages().recentJourneys;
  const [deletedIds, setDeletedIds] = useState<readonly string[]>([]);
  const visibleJourneys = visibleRecentJourneys(journeys, deletedIds);

  if (visibleJourneys.length === 0) {
    return null;
  }

  function handleDeleted(tripId: string) {
    setDeletedIds((current) => [...current, tripId]);
  }

  return (
    <section aria-labelledby="recent-journeys-title" className={styles.section} data-region="recent-journeys">
      <div className={styles.headingRow}>
        <h2 id="recent-journeys-title">{text.title}</h2>
      </div>
      {visibleJourneys.length === 1 ? (
        <div className={styles.single}>
          <JourneyCard journey={visibleJourneys[0]} isActive onDeleted={handleDeleted} />
        </div>
      ) : (
        <JourneyCarousel journeys={visibleJourneys} onDeleted={handleDeleted} />
      )}
    </section>
  );
}

function JourneyCarousel({
  journeys,
  onDeleted,
}: RecentJourneysProps & { readonly onDeleted: (tripId: string) => void }) {
  const text = useMessages().recentJourneys;
  const reduceMotion = useReducedMotion();
  const [viewportRef, emblaApi] = useEmblaCarousel({
    align: "center",
    containScroll: false,
    loop: shouldLoopRecentJourneys(journeys.length),
    slidesToScroll: 1,
  });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const { canScrollPrev, canScrollNext } = recentJourneysArrowState(journeys.length, selectedIndex);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const gestureWasDragged = useRef(false);

  const updateSelection = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    const frame = requestAnimationFrame(updateSelection);
    emblaApi.on("select", updateSelection).on("reInit", updateSelection);
    return () => {
      cancelAnimationFrame(frame);
      emblaApi.off("select", updateSelection).off("reInit", updateSelection);
    };
  }, [emblaApi, updateSelection]);

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    pointerStart.current = { x: event.clientX, y: event.clientY };
    gestureWasDragged.current = false;
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const start = pointerStart.current;
    if (start && Math.abs(event.clientX - start.x) > 8 &&
      Math.abs(event.clientX - start.x) > Math.abs(event.clientY - start.y)) {
      gestureWasDragged.current = true;
    }
  }

  function suppressDragClick(event: MouseEvent<HTMLDivElement>) {
    if (event.detail > 0 && gestureWasDragged.current) {
      event.preventDefault();
      event.stopPropagation();
      gestureWasDragged.current = false;
    }
  }

  return (
    <>
      <div className={styles.carouselRow}>
        <button
          aria-label={text.previous}
          className={styles.arrow}
          disabled={!canScrollPrev}
          onClick={() => emblaApi?.scrollPrev(Boolean(reduceMotion))}
          type="button"
        >
          <ChevronLeft aria-hidden="true" size={20} strokeWidth={1.8} />
        </button>
        <div
          className={styles.viewport}
          onClickCapture={suppressDragClick}
          onPointerDownCapture={handlePointerDown}
          onPointerMoveCapture={handlePointerMove}
          ref={viewportRef}
        >
          <ul className={styles.track}>
            {journeys.map((journey, index) => (
              <li className={styles.slide} data-active={index === selectedIndex} key={journey.id}>
                <JourneyCard
                  isActive={index === selectedIndex}
                  journey={journey}
                  onDeleted={onDeleted}
                  onClick={(event) => {
                    if (!shouldOpenJourneyCard(selectedIndex, index, gestureWasDragged.current)) {
                      event.preventDefault();
                      emblaApi?.scrollTo(index, Boolean(reduceMotion));
                    }
                  }}
                />
              </li>
            ))}
          </ul>
        </div>
        <button
          aria-label={text.next}
          className={styles.arrow}
          disabled={!canScrollNext}
          onClick={() => emblaApi?.scrollNext(Boolean(reduceMotion))}
          type="button"
        >
          <ChevronRight aria-hidden="true" size={20} strokeWidth={1.8} />
        </button>
      </div>
      <JourneyPagination
        count={journeys.length}
        onSelect={(index) => emblaApi?.scrollTo(index, Boolean(reduceMotion))}
        selectedIndex={selectedIndex}
      />
    </>
  );
}

function JourneyCard({
  isActive,
  journey,
  onClick,
  onDeleted,
}: {
  isActive: boolean;
  journey: JourneySummary;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  onDeleted: (tripId: string) => void;
}) {
  const text = useMessages().recentJourneys;
  return (
    <div className={styles.cardShell}>
      <Link
        aria-label={isActive ? text.open(journey.name) : text.select(journey.name)}
        className={styles.card}
        href={`/trips/${encodeURIComponent(journey.id)}`}
        onClick={onClick}
        tabIndex={isActive ? 0 : -1}
      >
        <div aria-hidden="true" className={styles.cover}>
          <span className={styles.coverRidge} />
        </div>
        <div className={styles.cardDetails}>
          <span className={styles.destination}>{journey.destination ?? text.destinationNotSet}</span>
          <span className={styles.name}>{journey.name}</span>
          <span className={styles.dates}>{formatDateRange(journey, text)}</span>
        </div>
      </Link>
      <RecentJourneyActions name={journey.name} onDeleted={onDeleted} tripId={journey.id} />
    </div>
  );
}

function JourneyPagination({
  count,
  onSelect,
  selectedIndex,
}: {
  count: number;
  onSelect: (index: number) => void;
  selectedIndex: number;
}) {
  const text = useMessages().recentJourneys;
  return (
    <div aria-label={text.choose} className={styles.pagination} role="group">
      {Array.from({ length: count }, (_, index) => (
        <button
          aria-label={text.goTo(index + 1, count)}
          aria-current={index === selectedIndex ? "true" : undefined}
          className={styles.pageButton}
          key={index}
          onClick={() => onSelect(index)}
          type="button"
        >
          <span className={styles.pageMark} />
        </button>
      ))}
    </div>
  );
}

function formatDateRange(journey: JourneySummary, text: Messages["recentJourneys"]): string {
  if (journey.startDate && journey.endDate) {
    return journey.startDate === journey.endDate
      ? journey.startDate
      : `${journey.startDate} — ${journey.endDate}`;
  }
  if (journey.startDate) return text.from(journey.startDate);
  if (journey.endDate) return text.until(journey.endDate);
  return text.flexibleDates;
}
