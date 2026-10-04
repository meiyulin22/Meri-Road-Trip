"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { motion, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import Link from "next/link";
import { useRef, useState, type MouseEvent, type PointerEvent } from "react";

import { useMessages } from "@/components/i18n/locale-context";
import type { Messages } from "@/components/i18n/messages";
import type { JourneySummary } from "@/platform/persistence/journey-summary-repository";

import {
  recentJourneyIndexAfterStep,
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
  const [selectedId, setSelectedId] = useState(journeys[0].id);
  const selectedIndex = Math.max(0, journeys.findIndex((journey) => journey.id === selectedId));
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const gestureWasDragged = useRef(false);

  function selectStep(step: -1 | 1) {
    setSelectedId(journeys[recentJourneyIndexAfterStep(journeys.length, selectedIndex, step)].id);
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    pointerStart.current = null;
    gestureWasDragged.current = false;
    if (event.button !== 0 || (event.target as HTMLElement).closest("button, [role='dialog']")) return;
    pointerStart.current = { x: event.clientX, y: event.clientY };
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    const start = pointerStart.current;
    pointerStart.current = null;
    if (!start || !gestureWasDragged.current) return;
    const distance = event.clientX - start.x;
    if (Math.abs(distance) >= 40) selectStep(distance < 0 ? 1 : -1);
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
        <div
          aria-label={text.choose}
          aria-roledescription="carousel"
          className={styles.viewport}
          role="group"
          onClickCapture={suppressDragClick}
          onPointerDownCapture={handlePointerDown}
          onPointerMoveCapture={handlePointerMove}
          onPointerUpCapture={handlePointerUp}
          onPointerCancel={() => { pointerStart.current = null; }}
          onPointerLeave={() => { pointerStart.current = null; }}
          onKeyDown={(event) => {
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
            event.preventDefault();
            selectStep(event.key === "ArrowLeft" ? -1 : 1);
          }}
          tabIndex={0}
        >
          {/* Adapted from Aceternity's Carousel: centered translated track and perspective slides. */}
          <ul className={styles.track} style={{
            transform: `translateX(calc(50% - var(--slide-width) / 2 - ${selectedIndex} * (var(--slide-width) + 1rem)))`,
          }}>
            {journeys.map((journey, index) => (
              <li className={styles.slide} data-active={index === selectedIndex} key={journey.id}>
                <JourneyCard
                  isActive={index === selectedIndex}
                  journey={journey}
                  onDeleted={onDeleted}
                  onClick={(event) => {
                    if (!shouldOpenJourneyCard(selectedIndex, index, gestureWasDragged.current)) {
                      event.preventDefault();
                      setSelectedId(journey.id);
                    }
                  }}
                />
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className={styles.controls}>
        <button
          aria-label={text.previous}
          className={styles.arrow}
          onClick={() => selectStep(-1)}
          type="button"
        >
          <ArrowLeft aria-hidden="true" size={20} strokeWidth={1.8} />
        </button>
        <JourneyPagination
          count={journeys.length}
          onSelect={(index) => setSelectedId(journeys[index].id)}
          selectedIndex={selectedIndex}
        />
        <button
          aria-label={text.next}
          className={styles.arrow}
          onClick={() => selectStep(1)}
          type="button"
        >
          <ArrowRight aria-hidden="true" size={20} strokeWidth={1.8} />
        </button>
      </div>
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
  const reduceMotion = useReducedMotion();
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const x = useSpring(pointerX, { stiffness: 180, damping: 25 });
  const y = useSpring(pointerY, { stiffness: 180, damping: 25 });

  function resetParallax() {
    pointerX.set(0);
    pointerY.set(0);
  }

  return (
    <div className={styles.cardShell} data-active={isActive}
      onPointerMove={(event) => {
        if (!isActive || reduceMotion || event.pointerType !== "mouse" || event.buttons !== 0) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        pointerX.set((event.clientX - bounds.left - bounds.width / 2) / 30);
        pointerY.set((event.clientY - bounds.top - bounds.height / 2) / 30);
      }}
      onPointerLeave={resetParallax}
      onPointerDown={resetParallax}
    >
      <Link
        aria-label={isActive ? text.open(journey.name) : text.select(journey.name)}
        className={styles.card}
        href={`/trips/${encodeURIComponent(journey.id)}`}
        draggable={false}
        onClick={onClick}
        tabIndex={isActive ? 0 : -1}
      >
        <motion.div aria-hidden="true" className={styles.cover}
          style={{ x: isActive && !reduceMotion ? x : 0, y: isActive && !reduceMotion ? y : 0 }} />
        <div className={styles.cardDetails}>
          <span className={styles.destination}>{journey.destination ?? text.destinationNotSet}</span>
          <span className={styles.name}>{journey.name}</span>
          <span className={styles.dates}>{formatDateRange(journey, text)}</span>
          <span className={styles.openLabel}>{text.continueJourney}<ArrowRight aria-hidden="true" size={16} /></span>
        </div>
      </Link>
      {isActive ? <RecentJourneyActions name={journey.name} onDeleted={onDeleted} tripId={journey.id} /> : null}
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
