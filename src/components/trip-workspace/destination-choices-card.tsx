"use client";

import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { useReducedMotion } from "motion/react";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from "react";

import type { DestinationChoicesPresentation } from "@/domain/trip-message/trip-message";
import { groupDestinationChoices } from "@/domain/trip-message/destination-choice-identity";
import { destinationContains, type DestinationArea } from "@/domain/trip-state/destination-areas";

import { AnimatedCheckbox } from "../ui/animated-checkbox";
import styles from "./destination-recommendation-picker.module.css";

export function DestinationChoicesCard({ presentation, areas, active, pending, error, onCommit }: {
  readonly presentation: DestinationChoicesPresentation;
  readonly areas: readonly DestinationArea[];
  readonly active: boolean;
  readonly pending: boolean;
  readonly error: boolean;
  readonly onCommit: (ids: readonly string[]) => void;
}) {
  const [picked, setPicked] = useState<readonly string[]>([]);
  const rows = groupDestinationChoices(presentation.choices);
  function isAdded(choice: DestinationChoicesPresentation["choices"][number]): boolean {
    return choice.city
      ? destinationContains(areas, { province: choice.province, place: choice.city, spot: choice.spot ?? null })
      : areas.some((area) => area.province === choice.province &&
        (area.province === choice.name || area.places.some((place) =>
          place.name === choice.name || place.spots.includes(choice.name))));
  }
  const selectedRows = rows.filter(({ choice }) => picked.includes(choice.id) &&
    (presentation.mode === "replace" || !isAdded(choice)));
  const selectedIds = selectedRows.flatMap((row) => row.ids);
  const groups = new Map<string, DestinationChoicesPresentation["choices"][number][]>();
  for (const { choice } of rows) {
    const group = groups.get(choice.province) ?? [];
    group.push(choice);
    groups.set(choice.province, group);
  }
  function toggle(choiceId: string): void {
    if (!active || pending) return;
    setPicked((current) => current.includes(choiceId) ? current.filter((id) => id !== choiceId) : [...current, choiceId]);
  }
  return <section aria-label="可添加的目的地" className={styles.picker}>
    {[...groups].map(([province, choices]) => <ProvinceRow key={province} province={province}>
      {choices.map((choice) => {
        const selected = isAdded(choice);
        // Current TripState decides the check: add cards lock saved places, and read-only
        // cards still show which of their places are in the Journey now.
        const inJourney = selected && (presentation.mode === "add" || !active);
        const checked = inJourney || selectedIds.includes(choice.id);
        return <li className={styles.slide} key={choice.id}>
          <PlaceCard
            checked={checked}
            choice={choice}
            disabled={!active || pending || (presentation.mode === "add" && selected) || choice.legacyUnverified === true}
            inJourney={inJourney}
            onToggle={() => toggle(choice.id)}
          />
        </li>;
      })}
    </ProvinceRow>)}
    <div className={styles.commit}>
      <span>{!active ? "历史选项，仅供查看" : selectedRows.length ? `已选 ${selectedRows.length} 个` : "可以一次选择多个城市"}</span>
      <button type="button" disabled={!active || pending || selectedIds.length === 0} onClick={() => { if (active && !pending && selectedIds.length) onCommit(selectedIds); }}>
        {pending ? "保存中…" : presentation.mode === "replace" ? "替换为所选目的地" : "添加所选"}
      </button>
    </div>
    {error && active ? <p className={styles.error} role="alert">保存失败，请重试。</p> : null}
  </section>;
}

/**
 * One province's places as a row that scrolls sideways: a dozen cards with photos would
 * run several screens tall stacked, and a row keeps every province's heading in view.
 */
function ProvinceRow({ province, children }: { readonly province: string; readonly children: ReactNode }) {
  const reduceMotion = useReducedMotion();
  const [viewportRef, emblaApi] = useEmblaCarousel({ align: "start", containScroll: "trimSnaps", dragFree: true });
  const [edges, setEdges] = useState({ canScrollPrev: false, canScrollNext: false });
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const dragged = useRef(false);

  const updateEdges = useCallback(() => {
    if (!emblaApi) return;
    setEdges({ canScrollPrev: emblaApi.canScrollPrev(), canScrollNext: emblaApi.canScrollNext() });
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    const frame = requestAnimationFrame(updateEdges);
    emblaApi.on("select", updateEdges).on("reInit", updateEdges).on("scroll", updateEdges);
    return () => {
      cancelAnimationFrame(frame);
      emblaApi.off("select", updateEdges).off("reInit", updateEdges).off("scroll", updateEdges);
    };
  }, [emblaApi, updateEdges]);

  function handlePointerDown(event: PointerEvent<HTMLDivElement>): void {
    pointerStart.current = { x: event.clientX, y: event.clientY };
    dragged.current = false;
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>): void {
    const start = pointerStart.current;
    if (start && Math.abs(event.clientX - start.x) > 8 &&
      Math.abs(event.clientX - start.x) > Math.abs(event.clientY - start.y)) {
      dragged.current = true;
    }
  }

  // A drag that ends over a card must not also tick its checkbox.
  function suppressDragClick(event: MouseEvent<HTMLDivElement>): void {
    if (event.detail > 0 && dragged.current) {
      event.preventDefault();
      event.stopPropagation();
    }
    dragged.current = false;
  }

  return <div className={styles.group}>
    <div className={styles.groupHeading}>
      <h3>{province}</h3>
      {edges.canScrollPrev || edges.canScrollNext ? <span className={styles.rowArrows}>
        <button aria-label={`${province}：上一组`} disabled={!edges.canScrollPrev} onClick={() => emblaApi?.scrollPrev(Boolean(reduceMotion))} type="button">
          <ChevronLeft aria-hidden="true" size={16} />
        </button>
        <button aria-label={`${province}：下一组`} disabled={!edges.canScrollNext} onClick={() => emblaApi?.scrollNext(Boolean(reduceMotion))} type="button">
          <ChevronRight aria-hidden="true" size={16} />
        </button>
      </span> : null}
    </div>
    <div className={styles.rowViewport} onClickCapture={suppressDragClick} onPointerDownCapture={handlePointerDown}
      onPointerMoveCapture={handlePointerMove} ref={viewportRef}>
      <ul className={styles.track}>{children}</ul>
    </div>
  </div>;
}

function PlaceCard({ choice, checked, disabled, inJourney, onToggle }: {
  readonly choice: DestinationChoicesPresentation["choices"][number];
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly inJourney: boolean;
  readonly onToggle: () => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const image = imageFailed ? undefined : choice.image;
  return <label className={styles.placeCard} data-state={inJourney ? "in-journey" : checked ? "picked" : undefined}>
    <span className={styles.placeImage}>
      {image ? <Image alt={image.caption} fill onError={() => setImageFailed(true)} sizes="200px" src={image.url} />
        : <span aria-hidden="true" className={styles.placeImageFallback}><MapPin size={22} /></span>}
      <span className={styles.placeCheck}>
        <AnimatedCheckbox checked={checked} disabled={disabled} onChange={onToggle} />
      </span>
      {inJourney ? <span className={styles.inJourneyBadge}>已在行程</span> : null}
      {image ? <span className={styles.placeCaption}>{image.caption}</span> : null}
    </span>
    <span className={styles.placeBody}>
      <span className={styles.name}>{choice.city ?? choice.name}</span>
      {choice.spot ? <small className={styles.choiceRegion}>想去：{choice.spot}（具体位置将在规划时确认）</small> : null}
      {!choice.city && choice.detail ? <small className={styles.choiceRegion}>{choice.detail}</small> : null}
      {choice.reason ? <span className={styles.reason}>{choice.reason}</span> : null}
      {choice.legacyUnverified ? <span className={styles.choiceStatus}>请重新搜索</span> : null}
    </span>
  </label>;
}
