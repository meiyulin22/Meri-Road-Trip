"use client";

import { motion, useReducedMotion } from "motion/react";
import type { InputHTMLAttributes } from "react";

import styles from "./animated-checkbox.module.css";

type AnimatedCheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "checked" | "className" | "type"> & {
  readonly checked: boolean;
};

// A real checkbox stays underneath so labels, keyboard focus and forms behave natively;
// only the visible box and its drawn check mark are custom.
export function AnimatedCheckbox({ checked, ...inputProps }: AnimatedCheckboxProps) {
  const reduceMotion = useReducedMotion();

  return (
    <span className={styles.checkbox}>
      <input {...inputProps} checked={checked} className={styles.input} type="checkbox" />
      <span aria-hidden="true" className={styles.box}>
        <svg viewBox="0 0 16 16">
          <motion.path
            animate={{ pathLength: checked ? 1 : 0, opacity: checked ? 1 : 0 }}
            d="M3.5 8.4 6.6 11.3 12.6 4.8"
            initial={false}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.24, ease: "easeOut" }}
          />
        </svg>
      </span>
    </span>
  );
}
