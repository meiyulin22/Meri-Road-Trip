"use client";

import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useReducedMotion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";

import type { JourneySummary } from "@/repositories/journey-summary-repository";

import { shouldLoopRecentJourneys, shouldOpenJourneyCard } from "./recent-journeys-model";
import styles from "./recent-journeys.module.css";

type RecentJourneysProps = {
  journeys: readonly JourneySummary[];
};

export function RecentJourneys({ journeys }: RecentJourneysProps) {
  if (journeys.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="recent-journeys-title" className={styles.section}>
      <div className={styles.headingRow}>
        <h2 id="recent-journeys-title">Continue exploring</h2>
      </div>
      {journeys.length === 1 ? (
        <div className={styles.single}>
          <JourneyCard journey={journeys[0]} isActive />
        </div>
      ) : (
        <JourneyCarousel journeys={journeys} />
      )}
    </section>
  );
}

function JourneyCarousel({ journeys }: RecentJourneysProps) {
  const reduceMotion = useReducedMotion();
  const [viewportRef, emblaApi] = useEmblaCarousel({
    align: "center",
    containScroll: false,
    loop: shouldLoopRecentJourneys(journeys.length),
    slidesToScroll: 1,
  });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(true);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const gestureWasDragged = useRef(false);

  const updateSelection = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
    setCanScrollPrev(emblaApi.canScrollPrev());
    setCanScrollNext(emblaApi.canScrollNext());
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
          aria-label="Previous journey"
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
          aria-label="Next journey"
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
}: {
  isActive: boolean;
  journey: JourneySummary;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  return (
    <Link
      aria-label={`${isActive ? "Open" : "Select"} ${journey.name}`}
      className={styles.card}
      href={`/trips/${encodeURIComponent(journey.id)}`}
      onClick={onClick}
      tabIndex={isActive ? 0 : -1}
    >
      <div aria-hidden="true" className={styles.cover}>
        <span className={styles.coverRidge} />
      </div>
      <div className={styles.cardDetails}>
        <span className={styles.destination}>{journey.destination ?? "Destination not set"}</span>
        <span className={styles.name}>{journey.name}</span>
        <span className={styles.dates}>{formatDateRange(journey)}</span>
      </div>
    </Link>
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
  return (
    <div aria-label="Choose a recent journey" className={styles.pagination} role="group">
      {Array.from({ length: count }, (_, index) => (
        <button
          aria-label={`Go to journey ${index + 1} of ${count}`}
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

function formatDateRange(journey: JourneySummary): string {
  if (journey.startDate && journey.endDate) {
    return journey.startDate === journey.endDate
      ? journey.startDate
      : `${journey.startDate} — ${journey.endDate}`;
  }
  if (journey.startDate) return `From ${journey.startDate}`;
  if (journey.endDate) return `Until ${journey.endDate}`;
  return "Flexible dates";
}
