import { Check, CircleAlert, CircleDashed, CircleDot } from "lucide-react";

import styles from "./trip-workspace.module.css";

export type FieldCertainty = "known" | "approximate" | "ambiguous" | "missing";

export const certaintyLabels: Record<FieldCertainty, string> = {
  known: "已理解",
  approximate: "大致范围",
  ambiguous: "需要确认",
  missing: "暂未确定",
};

/**
 * Each brief row says how sure Meri is, not just whether a value exists: 「下个月」 is
 * worth something but is not a date, so it must not look the same as an empty row.
 */
export function FieldStatusIcon({ state }: { readonly state: FieldCertainty }) {
  switch (state) {
    case "known":
      return <Check aria-hidden="true" size={14} />;
    case "approximate":
      return <CircleDot aria-hidden="true" size={16} />;
    case "ambiguous":
      return <CircleAlert aria-hidden="true" size={16} />;
    case "missing":
      return <CircleDashed aria-hidden="true" size={16} />;
  }
}

/** The visible word beside a value Meri only roughly understood. Screen readers get the
 * full label from the row heading instead, so this stays hidden from them. */
export function CertaintyTag({ state }: { readonly state: FieldCertainty }) {
  if (state !== "approximate" && state !== "ambiguous") return null;
  return (
    <small aria-hidden="true" className={styles.certaintyTag} data-certainty={state}>
      {state === "approximate" ? "大致" : "待确认"}
    </small>
  );
}
