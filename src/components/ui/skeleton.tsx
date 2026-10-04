import styles from "./skeleton.module.css";

/**
 * A quiet block that pulses where content is still on its way, after shadcn/ui's
 * Skeleton. Written in CSS Modules because Meri has no Tailwind; the caller sizes and
 * places it. Decorative only — whatever it stands in for carries the busy state.
 */
export function Skeleton({ className }: { readonly className?: string }) {
  return <span aria-hidden="true" className={className ? `${styles.skeleton} ${className}` : styles.skeleton} />;
}
