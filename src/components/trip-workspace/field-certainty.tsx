import { Check } from "lucide-react";

import { useMessages } from "@/components/i18n/locale-context";

import styles from "./trip-workspace.module.css";

export type FieldCertainty = "known" | "approximate" | "ambiguous" | "missing";

/**
 * Each brief row says how sure Meri is, not just whether a value exists: 「下个月」 is
 * worth something but is not a date, so it must not look the same as an empty row.
 * The rough states keep the same circle as the others, with a coloured ring.
 */
export function FieldStatusIcon({ state }: { readonly state: FieldCertainty }) {
  return (
    <span aria-hidden="true" className={styles.statusDot} data-certainty={state}>
      {state === "known" ? <Check size={12} strokeWidth={3} /> : state === "ambiguous" ? "!" : null}
    </span>
  );
}

/** How sure Meri is about a row, in words, beside its label. */
export function CertaintyLabel({ state }: { readonly state: FieldCertainty }) {
  const text = useMessages().brief;
  return <span className={styles.fieldCertainty}>{text.certainty[state]}</span>;
}

/** The visible word beside a value Meri only roughly understood. Screen readers get the
 * full label from the row heading instead, so this stays hidden from them. */
export function CertaintyTag({ state }: { readonly state: FieldCertainty }) {
  const text = useMessages().brief;
  if (state !== "approximate" && state !== "ambiguous") return null;
  return (
    <small aria-hidden="true" className={styles.certaintyTag} data-certainty={state}>
      {text.certaintyTag[state]}
    </small>
  );
}
