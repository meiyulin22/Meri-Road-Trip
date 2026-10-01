"use client";

import { useState } from "react";

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
  return <section aria-label="可添加的目的地" className={styles.picker}>
    {[...groups].map(([province, choices]) => <div className={styles.group} key={province}>
      <h3>{province}</h3>
      <ul>{choices.map((choice) => {
        const selected = isAdded(choice);
        // Current TripState decides the check: add cards lock saved places, and read-only
        // cards still show which of their places are in the Journey now.
        const inJourney = selected && (presentation.mode === "add" || !active);
        const checked = inJourney || selectedIds.includes(choice.id);
        return <li key={choice.id}>
          <div className={styles.choiceRow}>
            <label className={styles.place} data-state={inJourney ? "in-journey" : checked ? "picked" : undefined}>
              <AnimatedCheckbox checked={checked} disabled={!active || pending ||
                (presentation.mode === "add" && selected) || choice.legacyUnverified}
                onChange={() => { if (!active || pending) return; setPicked((current) => current.includes(choice.id)
                  ? current.filter((id) => id !== choice.id) : [...current, choice.id]); }} />
              <span className={styles.name}>{choice.city ?? choice.name}
                {inJourney ? <span className={styles.inJourneyBadge}>已在行程</span> : null}
                {choice.spot ? <small className={styles.choiceRegion}>想去：{choice.spot}（具体位置将在规划时确认）</small> : null}
                {!choice.city && choice.detail ? <small className={styles.choiceRegion}>{choice.detail}</small> : null}
              </span>
              {choice.reason ? <span className={styles.reason}>{choice.reason}</span> : null}
            </label>
            {choice.legacyUnverified ? <span className={styles.choiceStatus}>请重新搜索</span> : null}
          </div>
        </li>;
      })}</ul>
    </div>)}
    <div className={styles.commit}>
      <span>{!active ? "历史选项，仅供查看" : selectedRows.length ? `已选 ${selectedRows.length} 个` : "可以一次选择多个城市"}</span>
      <button type="button" disabled={!active || pending || selectedIds.length === 0} onClick={() => { if (active && !pending && selectedIds.length) onCommit(selectedIds); }}>
        {pending ? "保存中…" : presentation.mode === "replace" ? "替换为所选目的地" : "添加所选"}
      </button>
    </div>
    {error && active ? <p className={styles.error} role="alert">保存失败，请重试。</p> : null}
  </section>;
}
