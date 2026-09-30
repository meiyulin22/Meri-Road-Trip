"use client";

import { useState } from "react";

import type { DestinationChoicesPresentation } from "@/domain/trip-message/trip-message";
import { destinationContains, type DestinationArea } from "@/domain/trip-state/destination-areas";

import styles from "./destination-recommendation-picker.module.css";

export function DestinationChoicesCard({ presentation, areas, pending, error, onCommit }: {
  readonly presentation: DestinationChoicesPresentation;
  readonly areas: readonly DestinationArea[];
  readonly pending: boolean;
  readonly error: boolean;
  readonly onCommit: (ids: readonly string[]) => void;
}) {
  const [picked, setPicked] = useState<readonly string[]>([]);
  function isAdded(choice: DestinationChoicesPresentation["choices"][number]): boolean {
    return choice.city
      ? destinationContains(areas, { province: choice.province, place: choice.city, spot: choice.spot ?? null })
      : areas.some((area) => area.province === choice.province &&
        (area.province === choice.name || area.places.some((place) =>
          place.name === choice.name || place.spots.includes(choice.name))));
  }
  const selectedIds = picked.filter((id) => presentation.choices.some((choice) =>
    choice.id === id && (presentation.mode === "replace" || !isAdded(choice))));
  const groups = new Map<string, DestinationChoicesPresentation["choices"][number][]>();
  for (const choice of presentation.choices) {
    const group = groups.get(choice.province) ?? [];
    group.push(choice);
    groups.set(choice.province, group);
  }
  return <section aria-label="可添加的目的地" className={styles.picker}>
    {[...groups].map(([province, choices]) => <div className={styles.group} key={province}>
      <h3>{province}</h3>
      <ul>{choices.map((choice) => {
        const indistinguishable = choices.filter((item) => item.name === choice.name &&
          item.city === choice.city && item.detail === choice.detail).length > 1;
        const selected = isAdded(choice);
        return <li key={choice.id}>
          <div className={styles.choiceRow}>
            <label className={styles.place} data-picked={picked.includes(choice.id)}>
              <input type="checkbox" checked={selectedIds.includes(choice.id)} disabled={pending ||
                (presentation.mode === "add" && selected) || choice.legacyUnverified || indistinguishable}
                onChange={() => setPicked((current) => current.includes(choice.id)
                  ? current.filter((id) => id !== choice.id) : [...current, choice.id])} />
              <span className={styles.name}>{choice.name}
                {choice.city ? <small className={styles.choiceRegion}>{choice.province} · {choice.city}</small> : null}
                {choice.detail ? <small className={styles.choiceRegion}>{choice.detail}</small> : null}
              </span>
              {choice.reason ? <span className={styles.reason}>{choice.reason}</span> : null}
            </label>
            {indistinguishable || choice.legacyUnverified || (presentation.mode === "add" && selected)
              ? <span className={styles.choiceStatus}>{indistinguishable ? "请细化搜索" : choice.legacyUnverified ? "请重新搜索" : "已添加"}</span> : null}
          </div>
        </li>;
      })}</ul>
    </div>)}
    <div className={styles.commit}>
      <span>{selectedIds.length ? `已选 ${selectedIds.length} 个` : "可以一次选择多个城市"}</span>
      <button type="button" disabled={pending || selectedIds.length === 0} onClick={() => onCommit(selectedIds)}>
        {pending ? "保存中…" : presentation.mode === "replace" ? "替换为所选目的地" : "添加所选"}
      </button>
    </div>
    {error ? <p className={styles.error} role="alert">保存失败，请重试。</p> : null}
  </section>;
}
