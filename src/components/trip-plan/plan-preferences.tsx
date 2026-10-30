"use client";

import { X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { useMessages } from "@/components/i18n/locale-context";

import styles from "./trip-plan.module.css";

/**
 * Where a traveller tells Meri what matters to them, in their own words or by picking
 * common ones. A sheet from the bottom on a phone, a small window on a wide screen.
 * Saving adds them to what Meri remembers; it does not re-plan by itself.
 */
export function PreferenceSheet({ open, onClose, onSave }: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onSave: (preferences: readonly string[]) => void;
}) {
  const text = useMessages().plan;
  const reduce = useReducedMotion() ?? false;
  const [typed, setTyped] = useState("");
  const [picked, setPicked] = useState<readonly string[]>([]);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [open, onClose]);

  const chosen = [...(typed.trim() ? [typed.trim()] : []), ...picked];

  function save(event: FormEvent) {
    event.preventDefault();
    if (chosen.length === 0) return;
    onSave(chosen);
    setTyped("");
    setPicked([]);
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div className={styles.sheetBackdrop} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.2 }} onClick={onClose}>
          <motion.form className={styles.preferenceSheet} role="dialog" aria-modal="true" aria-labelledby="preference-title"
            onSubmit={save} onClick={(event) => event.stopPropagation()}
            initial={reduce ? false : { y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={reduce ? { opacity: 0 } : { y: 40, opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }}>
            <span className={styles.sheetHandle} aria-hidden="true" />
            <div className={styles.sheetHeader}>
              <h2 id="preference-title">{text.preferenceTitle}</h2>
              <button type="button" aria-label={text.cancel} onClick={onClose}><X aria-hidden="true" size={18} /></button>
            </div>
            <p className={styles.sheetHint}>{text.preferenceHint}</p>
            <input ref={input} value={typed} placeholder={text.preferencePlaceholder} aria-label={text.preferenceTitle}
              onChange={(event) => setTyped(event.target.value)} />
            <div className={styles.suggestions}>
              {text.preferenceSuggestions.map((suggestion) => {
                const on = picked.includes(suggestion);
                return (
                  <button type="button" key={suggestion} className={styles.choice} aria-pressed={on}
                    onClick={() => setPicked((current) => current.includes(suggestion) ? current.filter((item) => item !== suggestion) : [...current, suggestion])}>
                    {suggestion}
                  </button>
                );
              })}
            </div>
            <div className={styles.sheetActions}>
              <button type="button" className={styles.ghost} onClick={onClose}>{text.cancel}</button>
              <button type="submit" className={styles.confirm} disabled={chosen.length === 0}>{text.save}</button>
            </div>
          </motion.form>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
