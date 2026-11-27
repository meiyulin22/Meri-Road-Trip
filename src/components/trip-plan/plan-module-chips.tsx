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
export function PlanModuleChips({ modules, label }: { readonly modules: readonly PlanModule[]; readonly label: string }) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  if (modules.length === 0) return null;
  const opened = modules.find(({ key }) => key === openKey) ?? null;
  return (
    <div className={styles.modules}>
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
