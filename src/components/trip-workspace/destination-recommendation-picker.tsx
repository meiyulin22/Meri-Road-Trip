"use client";

import { useState } from "react";

import type { DestinationRecommendationPresentation } from "@/domain/trip-message/trip-message";
import { groupRecommendationsByProvince } from "./destination-recommendation-model";

import styles from "./destination-recommendation-picker.module.css";

/**
 * A regional trip is several places at once — 川西 is 甘孜 and 阿坝 — so the places are
 * picked together and committed once, rather than one card ending the question. The
 * provinces are headings because that is how the destination itself is grouped.
 */
export function DestinationRecommendationPicker({
  chosen, destinations, disabled, error, onCommit, pending,
}: {
  readonly chosen: readonly string[];
  readonly destinations: DestinationRecommendationPresentation["destinations"];
  readonly disabled: boolean;
  readonly error: boolean;
  readonly onCommit: (destinationIds: readonly string[]) => void;
  readonly pending: boolean;
}) {
  const [picked, setPicked] = useState<readonly string[]>(() => destinations
    .filter((destination) => chosen.includes(destination.name))
    .map((destination) => destination.id));
  const locked = disabled || pending;
  const settled = disabled && picked.length > 0;

  function toggle(destinationId: string): void {
    setPicked((current) => current.includes(destinationId)
      ? current.filter((item) => item !== destinationId)
      : [...current, destinationId]);
  }

  return (
    <section aria-label="推荐的目的地" className={styles.picker}>
      {groupRecommendationsByProvince(destinations).map((group) => (
        <div className={styles.group} key={group.province ?? ""}>
          {group.province === null ? null : <h3>{group.province}</h3>}
          <ul>
            {group.destinations.map((destination) => (
              <li key={destination.id}>
                <label className={styles.place} data-picked={picked.includes(destination.id)}>
                  <input
                    checked={picked.includes(destination.id)}
                    disabled={locked}
                    onChange={() => toggle(destination.id)}
                    type="checkbox"
                  />
                  <span className={styles.name}>{destination.name}</span>
                  <span className={styles.reason}>{destination.reason}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <div className={styles.commit}>
        <span>{picked.length === 0 ? "想去哪些都可以选上" : `已选 ${picked.length} 个`}</span>
        <button disabled={locked || picked.length === 0} onClick={() => onCommit(picked)} type="button">
          {pending ? "保存中…" : settled ? "已选好" : "就去这些"}
        </button>
      </div>
      {error ? <p className={styles.error} role="alert">保存失败，请重试。</p> : null}
    </section>
  );
}
