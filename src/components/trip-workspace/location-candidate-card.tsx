"use client";

import { Check, ChevronRight } from "lucide-react";

import type { LocationCandidate } from "@/domain/location/location";

import styles from "./trip-workspace.module.css";

export function LocationCandidateCard({ candidate, disabled, onSelect, pending, selected }: {
  readonly candidate: LocationCandidate;
  readonly disabled: boolean;
  readonly onSelect: () => void;
  readonly pending: boolean;
  readonly selected: boolean;
}) {
  return (
    <button
      className={styles.locationCandidateCard}
      data-pending={pending}
      data-selected={selected}
      disabled={disabled}
      onClick={onSelect}
      type="button"
    >
      <span className={styles.locationCandidateHeading}>
        <strong>{candidate.name}</strong>
        <span className={styles.locationCandidateAffordance}>
          {selected ? <><Check aria-hidden="true" size={15} />已选择</> :
            pending ? "保存中…" : <><span>选择</span><ChevronRight aria-hidden="true" size={16} /></>}
        </span>
      </span>
      {candidate.region ? <span className={styles.locationCandidateContext}>{candidate.region}</span> : null}
      {candidate.address && candidate.address !== candidate.region
        ? <small className={styles.locationCandidateAddress}>{candidate.address}</small> : null}
    </button>
  );
}
