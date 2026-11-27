"use client";

import { ChevronDown } from "lucide-react";
import { type ReactNode, useState } from "react";

import styles from "./plan-module-chips.module.css";

/** One block of a city (2026-11-27 re-layout): a chip with a one-line summary that opens its card. */
export type PlanModule = {
  readonly key: string;
  readonly icon: ReactNode;
  readonly label: string;
  readonly summary: string;
  readonly content: ReactNode;
};

/**
 * A city's blocks as a row of chips, all closed at first so the days follow the city heading at
 * once; one opens at a time, its card below the row.
 */
export function PlanModuleChips({ modules, label, id, openKey: controlledKey, onOpenKeyChange }: {
  readonly modules: readonly PlanModule[];
  readonly label: string;
  /** For a link elsewhere on the page to scroll to this row (a day's 「今晚住」). */
  readonly id?: string;
  /** Given with onOpenKeyChange, the page decides which block is open; otherwise the row does. */
  readonly openKey?: string | null;
  readonly onOpenKeyChange?: (key: string | null) => void;
}) {
  const [ownKey, setOwnKey] = useState<string | null>(null);
  const controlled = onOpenKeyChange !== undefined;
  const openKey = controlled ? controlledKey ?? null : ownKey;
  const setOpenKey = controlled ? onOpenKeyChange : setOwnKey;
  if (modules.length === 0) return null;
  const opened = modules.find(({ key }) => key === openKey) ?? null;
  return (
    <div className={styles.modules} id={id}>
      <div className={styles.chips} role="group" aria-label={label}>
        {modules.map((module) => (
          <button key={module.key} type="button" className={styles.chip} aria-expanded={openKey === module.key}
            onClick={() => setOpenKey(openKey === module.key ? null : module.key)}>
            <span className={styles.icon} aria-hidden="true">{module.icon}</span>
            <span className={styles.label}>{module.label}</span>
            <span className={styles.summary}>{module.summary}</span>
            <ChevronDown aria-hidden="true" size={14} className={styles.chevron} />
          </button>
        ))}
      </div>
      {opened ? <div className={styles.content}>{opened.content}</div> : null}
    </div>
  );
}
